import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabase';
import { getEntitlement } from '@packages/security/entitlements';
import { loadRegistryAdapters, recordSourceOutcome } from '../jobsources/registry';
import { duplicateKey } from '../jobsources/dedup';
import { defaultFetchImpl, type FetchLike, type NormalizedJob, type SourceAdapter } from '../jobsources/types';
import { prepareApplication, appendApplicationEvent } from '../applications/service';
import { generateDocument } from '../generation/service';
import { persistGeneratedDocument } from '../generation/persist';
import { loadGenerationProfile } from '../generation/loader';
import { detectApplyAdapter } from '../apply/registry';
import { sendAgentFoundJobsEmail } from '../email/resend';
import { SITE_URL } from '../site';

/**
 * Per-user job discovery (owner decision 2026-09-21: turn discovery back on).
 *
 * The agent reads the user's own details (target roles, locations, remote and
 * salary preferences, daily target, send policy), searches the public job
 * boards in the job_sources registry, and adds matching roles to the user's
 * pipeline. Every discovered job:
 *   1. is a URL the autopilot can actually submit to (Greenhouse or Lever),
 *   2. becomes a private jobs row owned by this user (never a shared pool),
 *   3. gets a tailored CV + cover letter crafted from the user's verified
 *      profile facts (deterministic generator, same as the document route),
 *   4. sits at AWAITING_APPROVAL, or is submitted automatically when the user
 *      chose the 'auto' send policy (paid plans only; every server-side gate
 *      still applies at submission time).
 *
 * Quotas are enforced per plan exactly as advertised: Basic 2 agent runs in
 * total (lifetime), Premium 10 a day, Max 20 a day (the same counters the
 * entitlement view reads). Discovery never runs for FREE users.
 */

/** How many listings to request per source per run. */
const PER_SOURCE_LIMIT = 50;
/** Hard ceiling of new applications per user per discovery run. */
const MAX_PER_USER_PER_RUN = 5;
/** Max users processed per pipeline invocation (1000-user hardening). */
const MAX_USERS_PER_RUN = 25;
/** Skip a user whose last discovery run is newer than this. */
const DISCOVERY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export interface DiscoveryUserContext {
  userId: string;
  email: string;
  plan: string;
  active: boolean;
  applicationMode: string;
  dailyTarget: number;
  targetRoles: string[];
  remoteTypes: string[];
  locations: string[];
  salaryMin: number | null;
  currency: string;
  applicationsRemaining: number;
}

export interface DiscoveryOutcome {
  userId: string;
  skipped?: 'NOT_ENTITLED' | 'PAUSED' | 'NO_TARGET_ROLES' | 'NO_CAREER_PROFILE' | 'QUOTA_EXHAUSTED' | 'COOLDOWN' | 'NO_MATCHES' | 'NO_SOURCES';
  scanned: number;
  matched: number;
  created: number;
  crafted: number;
  autoSubmittedQueued: number;
  errors: string[];
}

export interface DiscoveryStageReport {
  usersConsidered: number;
  usersRun: number;
  applicationsCreated: number;
  sources: { source: string; ok: boolean; fetched: number; error?: string }[];
  outcomes: DiscoveryOutcome[];
}

export interface DiscoveryDeps {
  db: SupabaseClient;
  fetchImpl?: FetchLike;
  /** Test seam: which URLs the autopilot can submit to. */
  isSubmittable?: (url: string) => boolean;
}

function defaultDeps(partial: Partial<DiscoveryDeps> = {}): DiscoveryDeps {
  return {
    db: supabaseAdmin,
    fetchImpl: defaultFetchImpl(),
    isSubmittable: (url: string) => !!detectApplyAdapter(url),
    ...partial,
  };
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/* ==========================================================================
   Pure matching logic (unit-tested; no I/O)
   ========================================================================== */

const ROLE_STOPWORDS = new Set(['and', 'or', 'the', 'of', 'a', 'an', 'to', 'for', 'in', 'with', 'at', 'my', 'as']);

function stem(token: string): string {
  return token.replace(/(ings|ing|ers|er|ions|ion|ies|s)$/, (m, _g) => (token.length - m.length >= 4 ? '' : m));
}

function levenshtein1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length < b.length) {
      j++;
    } else {
      i++;
    }
  }
  return true;
}

function tokensMatch(roleToken: string, titleToken: string): boolean {
  if (roleToken === titleToken) return true;
  if (roleToken.length >= 4 && titleToken.length >= 4 && (roleToken.startsWith(titleToken) || titleToken.startsWith(roleToken))) return true;
  if (roleToken.length >= 5 && titleToken.length >= 5 && levenshtein1(roleToken, titleToken)) return true;
  const sr = stem(roleToken);
  const st = stem(titleToken);
  return sr === st && sr.length >= 4;
}

/** Does one target role (e.g. "Graphics Design") match a job title? */
export function roleMatchesTitle(role: string, title: string): boolean {
  const r = role.trim().toLowerCase();
  const t = title.trim().toLowerCase();
  if (!r || !t) return false;
  if (t.includes(r) || r.includes(t)) return true;
  const roleTokens = r.split(/[^a-z0-9+#]+/).filter((w) => w.length >= 2 && !ROLE_STOPWORDS.has(w));
  if (roleTokens.length === 0) return false;
  const titleTokens = t.split(/[^a-z0-9+#]+/).filter((w) => w.length >= 2);
  // Every significant word of the role must appear (fuzzily) in the title:
  // "ai enginer" matches "AI Engineer", "Writing" matches "Technical Writer".
  return roleTokens.every((rt) => titleTokens.some((tt) => tokensMatch(rt, tt)));
}

function jobIsRemote(job: { location?: string | null; title?: string | null }): boolean {
  return /remote|anywhere|worldwide|global|distributed/i.test(`${job.location ?? ''} ${job.title ?? ''}`);
}

function locationOk(job: NormalizedJob, user: Pick<DiscoveryUserContext, 'locations' | 'remoteTypes'>): boolean {
  const wantsRemote = user.remoteTypes.length > 0;
  const wantsPlaces = user.locations.length > 0;
  if (!wantsRemote && !wantsPlaces) return true; // no constraint given
  if (jobIsRemote(job)) return true; // a remote listing satisfies both remote and place preferences
  if (!wantsPlaces) return false; // remote-only user, on-site listing
  const jobLoc = (job.location ?? '').toLowerCase();
  return user.locations.some((place) => {
    const p = place.trim().toLowerCase();
    return p.length > 0 && (jobLoc.includes(p) || p.includes(jobLoc.split(',')[0].trim()));
  });
}

/** Full per-job match: submittable URL + role + location/remote preference.
 *  Employment type and salary are NOT filtered: the public board APIs do not
 *  provide them as structured data, and we never guess. */
export function jobMatchesUser(job: NormalizedJob, user: DiscoveryUserContext, isSubmittable: (url: string) => boolean): boolean {
  if (!job.url || !isSubmittable(job.url)) return false;
  if (!user.targetRoles.some((role) => roleMatchesTitle(role, job.title))) return false;
  return locationOk(job, user);
}

/** Rank exact-substring role matches ahead of fuzzy ones. */
export function rankMatches(jobs: NormalizedJob[], user: DiscoveryUserContext): NormalizedJob[] {
  const score = (job: NormalizedJob): number => {
    const t = job.title.toLowerCase();
    return user.targetRoles.some((role) => t.includes(role.trim().toLowerCase())) ? 0 : 1;
  };
  return [...jobs].sort((a, b) => score(a) - score(b));
}

/* ==========================================================================
   User context + eligibility
   ========================================================================== */

interface PreferencesRow {
  active: boolean;
  application_mode: string;
  daily_target: number;
  remote_types: string[];
  locations: string[];
  employment_types: string[];
  salary_min: number | null;
  currency: string;
  discovered_at: string | null;
}

async function loadUserContext(db: SupabaseClient, userId: string, email: string | undefined, now: Date): Promise<{ user?: DiscoveryUserContext; skipped?: DiscoveryOutcome['skipped']; email?: string }> {
  let entitlement: Awaited<ReturnType<typeof getEntitlement>> | null = null;
  try {
    entitlement = await getEntitlement(userId);
  } catch {
    return { skipped: 'NOT_ENTITLED' };
  }
  if (!entitlement || entitlement.account_status !== 'ACTIVE' || !entitlement.automation_enabled) return { skipped: 'NOT_ENTITLED' };
  if (Number(entitlement.applications_remaining) <= 0) return { skipped: 'QUOTA_EXHAUSTED' };

  const [prefsRes, profRes] = await Promise.all([
    db.from('job_preferences').select('active,application_mode,daily_target,remote_types,locations,employment_types,salary_min,currency,discovered_at').eq('user_id', userId).maybeSingle(),
    db.from('profiles').select('email,target_roles').eq('user_id', userId).maybeSingle(),
  ]);
  const prefs = prefsRes.data as PreferencesRow | null;
  if (!prefs || prefs.active === false) return { skipped: 'PAUSED' };
  if (prefs.discovered_at && now.getTime() - new Date(prefs.discovered_at).getTime() < DISCOVERY_COOLDOWN_MS) return { skipped: 'COOLDOWN' };

  const prof = profRes.data as { email?: string | null; target_roles?: string[] } | null;
  const targetRoles = (prof?.target_roles ?? []).map((r) => r.trim()).filter((r) => r.length > 0);
  if (targetRoles.length === 0) return { skipped: 'NO_TARGET_ROLES' };

  const userEmail = prof?.email || email || '';
  if (!userEmail) return { skipped: 'NO_TARGET_ROLES' }; // no email: nowhere to notify, nothing to submit

  const profile = await loadGenerationProfile(userId);
  if (!profile) return { skipped: 'NO_CAREER_PROFILE' };

  return {
    email: userEmail,
    user: {
      userId,
      email: userEmail,
      plan: String(entitlement.plan ?? 'FREE'),
      active: prefs.active,
      applicationMode: prefs.application_mode ?? 'approval',
      dailyTarget: Math.max(1, Math.min(50, prefs.daily_target ?? 10)),
      targetRoles,
      remoteTypes: prefs.remote_types ?? [],
      locations: prefs.locations ?? [],
      salaryMin: prefs.salary_min ?? null,
      currency: prefs.currency ?? 'NGN',
      applicationsRemaining: Number(entitlement.applications_remaining),
    },
  };
}

/* ==========================================================================
   Source collection (fetch each board once per run, not once per user)
   ========================================================================== */

async function collectListings(deps: DiscoveryDeps, now: Date): Promise<{ listings: NormalizedJob[]; sources: DiscoveryStageReport['sources'] }> {
  // Only Greenhouse and Lever listings can be submitted by the autopilot
  // today; Ashby boards stay in the registry for when an adapter exists.
  const adapters = (await loadRegistryAdapters(deps.fetchImpl ?? defaultFetchImpl(), () => [] as SourceAdapter[])).filter((a) => a.id.startsWith('greenhouse:') || a.id.startsWith('lever:'));
  const sources: DiscoveryStageReport['sources'] = [];
  if (adapters.length === 0) return { listings: [], sources };

  const results = await Promise.allSettled(adapters.map(async (adapter) => {
    const jobs = await adapter.fetchBatch(PER_SOURCE_LIMIT);
    return { adapter, jobs };
  }));

  const byKey = new Map<string, NormalizedJob>();
  results.forEach((result, i) => {
    const adapter = adapters[i];
    if (result.status === 'fulfilled') {
      sources.push({ source: adapter.id, ok: true, fetched: result.value.jobs.length });
      void recordSourceOutcome(adapter.id, true);
      for (const job of result.value.jobs) {
        const key = duplicateKey(job) ?? `${job.source}:${job.external_id}`;
        if (!byKey.has(key)) byKey.set(key, { ...job, metadata: { ...job.metadata, sourceId: adapter.id } });
      }
    } else {
      const message = result.reason instanceof Error ? result.reason.message : 'SOURCE_FAILED';
      sources.push({ source: adapter.id, ok: false, fetched: 0, error: message.slice(0, 120) });
      void recordSourceOutcome(adapter.id, false);
    }
  });
  void now;
  return { listings: [...byKey.values()], sources };
}

/* ==========================================================================
   One discovered job -> private jobs row + crafted application
   ========================================================================== */

interface CreatedApplication {
  result: 'created' | 'duplicate' | 'error' | 'craft_failed';
  applicationId?: string;
  jobId?: string;
}

async function createDiscoveredApplication(deps: DiscoveryDeps, user: DiscoveryUserContext, job: NormalizedJob): Promise<CreatedApplication> {
  const { db } = deps;
  const externalId = sha256(`${user.userId}:${job.url}`);

  // If the user already pasted this exact link themselves, it is already in
  // their pipeline; never add a second copy.
  const { data: manual } = await db.from('jobs').select('id').eq('source', 'MANUAL').eq('external_id', externalId).maybeSingle();
  if (manual) return { result: 'duplicate' };

  const attribution = typeof job.metadata.attribution === 'string' ? job.metadata.attribution : `Listing data from the employer public board (${String(job.metadata.sourceId ?? job.source)})`;

  const { data: jobRow, error: jobError } = await db
    .from('jobs')
    .insert({
      source: 'DISCOVERED',
      external_id: externalId,
      company: job.company,
      title: job.title,
      url: job.url,
      description: job.description,
      location: job.location,
      metadata: { originUser: user.userId, discovered: true, sourceId: job.metadata.sourceId ?? null, attribution },
    })
    .select('id')
    .single();
  if (jobError || !jobRow) {
    const code = (jobError as { code?: string } | null)?.code;
    if (code === '23505') return { result: 'duplicate' }; // already discovered for this user
    return { result: 'error' };
  }

  const detail = await prepareApplication(user.userId, jobRow.id, user.email);
  const app = detail.application;
  if (app.status !== 'PREPARING') return { result: 'duplicate', applicationId: app.id, jobId: jobRow.id }; // an active application already exists

  // Craft the package from verified profile facts only (deterministic
  // generator, identical to the user-facing document route; no provider
  // dependency, so a provider outage can never stall the agent).
  const profile = await loadGenerationProfile(user.userId);
  if (!profile) return { result: 'craft_failed', applicationId: app.id, jobId: jobRow.id };
  const genJob = { company: job.company, title: job.title, description: job.description, location: job.location ?? undefined };
  const [cv, cover] = await Promise.all([
    generateDocument({ kind: 'CV', profile, job: genJob, deterministicOnly: true }),
    generateDocument({ kind: 'COVER_LETTER', profile, job: genJob, deterministicOnly: true }),
  ]);
  if (!cv.report.passed || !cover.report.passed) return { result: 'craft_failed', applicationId: app.id, jobId: jobRow.id };

  await persistGeneratedDocument({ userId: user.userId, applicationId: app.id, kind: cv.kind, title: cv.title, content: cv.content, report: cv.report, provider: cv.provider });
  await persistGeneratedDocument({ userId: user.userId, applicationId: app.id, kind: cover.kind, title: cover.title, content: cover.content, report: cover.report, provider: cover.provider });

  await db.from('applications').update({ status: 'AWAITING_APPROVAL' }).eq('id', app.id).eq('user_id', user.userId);
  await appendApplicationEvent(user.userId, app.id, 'DISCOVERED', { source: String(job.metadata.sourceId ?? job.source), job: `${job.company}; ${job.title}` });
  await appendApplicationEvent(user.userId, app.id, 'PREPARED', { method: 'agent', documents: [cv.kind, cover.kind] });

  return { result: 'created', applicationId: app.id, jobId: jobRow.id };
}

/** Meter one agent run against the plan quota (same counters the
 *  entitlement view reads: usage_lifetime for Basic, usage_daily for
 *  Premium/Max). Best-effort: never fails the discovery. */
async function meterApplication(deps: DiscoveryDeps, user: DiscoveryUserContext, today: string): Promise<void> {
  const { db } = deps;
  try {
    if (user.plan === 'BASIC') {
      await db.from('usage_lifetime').upsert({ user_id: user.userId }, { onConflict: 'user_id', ignoreDuplicates: true });
      const { data } = await db.from('usage_lifetime').select('auto_apply_used').eq('user_id', user.userId).maybeSingle();
      const used = (data as { auto_apply_used?: number } | null)?.auto_apply_used ?? 0;
      await db.from('usage_lifetime').update({ auto_apply_used: used + 1 }).eq('user_id', user.userId);
    } else {
      await db.from('usage_daily').upsert({ user_id: user.userId, day: today }, { onConflict: 'user_id,day', ignoreDuplicates: true });
      const { data } = await db.from('usage_daily').select('applications_used').eq('user_id', user.userId).eq('day', today).maybeSingle();
      const used = (data as { applications_used?: number } | null)?.applications_used ?? 0;
      await db.from('usage_daily').update({ applications_used: used + 1 }).eq('user_id', user.userId).eq('day', today);
    }
  } catch {
    /* metering is best-effort */
  }
}

async function enqueueAutoSubmit(deps: DiscoveryDeps, user: DiscoveryUserContext, applicationId: string, jobId: string): Promise<void> {
  const { db } = deps;
  const { data: existing } = await db.from('agent_tasks').select('id').eq('user_id', user.userId).eq('application_id', applicationId).eq('type', 'APPLICATION').in('status', ['QUEUED', 'RUNNING']).maybeSingle();
  if (existing) return;
  await db.from('agent_tasks').insert({ user_id: user.userId, application_id: applicationId, type: 'APPLICATION', status: 'QUEUED', payload: { application_id: applicationId, job_id: jobId, mode: 'auto' } });
}

/* ==========================================================================
   Public API
   ========================================================================== */

async function discoverForUser(deps: DiscoveryDeps, user: DiscoveryUserContext, listings: NormalizedJob[], today: string): Promise<DiscoveryOutcome> {
  const outcome: DiscoveryOutcome = { userId: user.userId, scanned: listings.length, matched: 0, created: 0, crafted: 0, autoSubmittedQueued: 0, errors: [] };
  const budget = Math.max(0, Math.min(user.dailyTarget, user.applicationsRemaining, MAX_PER_USER_PER_RUN));
  if (budget <= 0) {
    outcome.skipped = 'QUOTA_EXHAUSTED';
    return outcome;
  }

  const isSubmittable = deps.isSubmittable ?? ((url: string) => !!detectApplyAdapter(url));
  const matches = rankMatches(listings.filter((job) => jobMatchesUser(job, user, isSubmittable)), user).slice(0, budget * 3);
  outcome.matched = matches.length;
  if (matches.length === 0) {
    outcome.skipped = 'NO_MATCHES';
    return outcome;
  }

  for (const job of matches) {
    if (outcome.created >= budget) break;
    try {
      const created = await createDiscoveredApplication(deps, user, job);
      if (created.result === 'created' && created.applicationId) {
        outcome.created++;
        outcome.crafted++;
        await meterApplication(deps, user, today);
        if (user.applicationMode === 'auto') {
          await enqueueAutoSubmit(deps, user, created.applicationId, created.jobId ?? '');
          outcome.autoSubmittedQueued++;
        }
      } else if (created.result === 'error') {
        outcome.errors.push(`${job.company}; ${job.title}`);
      }
    } catch (error) {
      outcome.errors.push(`${job.company}; ${job.title}: ${error instanceof Error ? error.message.slice(0, 80) : 'ERROR'}`);
    }
  }
  return outcome;
}

/** Run discovery for one user (JOB_DISCOVERY task path, e.g. right after a
 *  paid plan is activated). Fetches the boards once, matches one user. */
export async function runDiscoveryForUser(userId: string, email: string | undefined, partial: Partial<DiscoveryDeps> = {}): Promise<DiscoveryOutcome> {
  const deps = defaultDeps(partial);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const loaded = await loadUserContext(deps.db, userId, email, now);
  if (loaded.skipped || !loaded.user) {
    return { userId, skipped: loaded.skipped ?? 'NOT_ENTITLED', scanned: 0, matched: 0, created: 0, crafted: 0, autoSubmittedQueued: 0, errors: [] };
  }

  const { listings, sources } = await collectListings(deps, now);
  if (sources.length === 0) {
    return { userId, skipped: 'NO_SOURCES', scanned: 0, matched: 0, created: 0, crafted: 0, autoSubmittedQueued: 0, errors: [] };
  }

  const outcome = await discoverForUser(deps, loaded.user, listings, today);
  await markDiscovered(deps, userId);
  await maybeNotify(deps, loaded.user, loaded.email ?? '', outcome);
  return outcome;
}

/** Daily stage: find every eligible paid user and run discovery for each.
 *  Called by the pipeline before task draining, so applications created in
 *  'auto' mode are submitted in the same run. */
export async function runDiscoveryStage(partial: Partial<DiscoveryDeps> = {}): Promise<DiscoveryStageReport> {
  const deps = defaultDeps(partial);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const report: DiscoveryStageReport = { usersConsidered: 0, usersRun: 0, applicationsCreated: 0, sources: [], outcomes: [] };

  const { data: subs } = await deps.db.from('subscriptions').select('user_id,plan').in('plan', ['BASIC', 'PREMIUM', 'MAX']).limit(MAX_USERS_PER_RUN);
  const candidates = ((subs ?? []) as Array<{ user_id: string; plan: string }>).map((s) => s.user_id);
  report.usersConsidered = candidates.length;
  if (candidates.length === 0) return report;

  const { listings, sources } = await collectListings(deps, now);
  report.sources = sources;
  if (sources.length === 0) return report;

  for (const userId of candidates) {
    const loaded = await loadUserContext(deps.db, userId, undefined, now);
    if (loaded.skipped || !loaded.user) {
      report.outcomes.push({ userId, skipped: loaded.skipped ?? 'NOT_ENTITLED', scanned: 0, matched: 0, created: 0, crafted: 0, autoSubmittedQueued: 0, errors: [] });
      continue;
    }
    report.usersRun++;
    const outcome = await discoverForUser(deps, loaded.user, listings, today);
    report.applicationsCreated += outcome.created;
    report.outcomes.push(outcome);
    await markDiscovered(deps, userId);
    await maybeNotify(deps, loaded.user, loaded.email ?? '', outcome);
  }
  return report;
}

async function markDiscovered(deps: DiscoveryDeps, userId: string): Promise<void> {
  try {
    await deps.db.from('job_preferences').update({ discovered_at: new Date().toISOString() }).eq('user_id', userId);
  } catch {
    /* cooldown bookkeeping must never fail the run */
  }
}

/** Approval-mode users get one email per run when new applications land, so
 *  "added to your pipeline so you can see it" reaches their inbox. Auto-mode
 *  users instead get the submitted email after the pipeline drains. */
async function maybeNotify(deps: DiscoveryDeps, user: DiscoveryUserContext, email: string, outcome: DiscoveryOutcome): Promise<void> {
  void deps;
  if (outcome.created <= 0 || user.applicationMode === 'auto' || !email) return;
  try {
    await sendAgentFoundJobsEmail(email, {
      count: outcome.created,
      firstName: undefined,
      pipelineUrl: `${SITE_URL}/applications`,
    });
  } catch {
    /* notification is best-effort; the applications are in the pipeline */
  }
}
