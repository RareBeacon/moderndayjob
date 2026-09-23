import { supabaseAdmin } from '@/lib/supabase';
import { assertEntitlement } from '@packages/security/entitlements';
import { appendApplicationEvent, JOB_EXPIRY_MS } from '@/lib/applications/service';
import { decideAutoSubmit, messageForGate } from './gate';
import { detectApplyAdapter } from './registry';
import { submitViaBrowser } from './client';
import { consumeCredit, creditAvailable, CreditExhaustedError, ledgerEnabled, releaseCredit, reserveCredit } from '@/lib/credits';
import { verifyApprovalAndRevert } from './snapshot';
import { checkCapabilityAudited, agentDryRun } from '@/lib/agent/capabilities';
import { sendApplicationSubmittedEmail } from '@/lib/email/resend';
import { SITE_URL } from '@/lib/site';
import type { ApplyCandidate } from './types';

/**
 * APPLICATION task processor (Phase 8). Called by lib/agent/pipeline for
 * agent_tasks of type 'APPLICATION'. Re-checks EVERY gate server-side before
 * touching a browser, then delegates to the isolated browser worker. The
 * browser is never trusted: entitlement, application state and the kill
 * switch are all decided here from the database.
 */

export interface ApplicationTaskOutcome {
  status: 'SUCCEEDED' | 'WAITING_APPROVAL';
  result: Record<string, unknown>;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  job_id: string | null;
  email: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  error: string | null;
}

interface JobRow {
  id: string;
  company: string | null;
  title: string | null;
  url: string | null;
  created_at: string | null;
}

async function loadApplication(appId: string): Promise<ApplicationRow | null> {
  const { data } = await supabaseAdmin
    .from('applications')
    .select('id,user_id,job_id,email,status,submitted_at,created_at,error')
    .eq('id', appId)
    .maybeSingle();
  return (data as ApplicationRow | null) ?? null;
}

async function loadJob(jobId: string): Promise<JobRow | null> {
  const { data } = await supabaseAdmin
    .from('jobs')
    .select('id,company,title,url,created_at')
    .eq('id', jobId)
    .maybeSingle();
  return (data as JobRow | null) ?? null;
}

async function loadPreferences(userId: string): Promise<{ active: boolean; application_mode?: string } | null> {
  const { data } = await supabaseAdmin
    .from('job_preferences')
    .select('active,application_mode')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { active: boolean; application_mode?: string } | null) ?? null;
}

async function loadProfile(userId: string): Promise<{ full_name: string | null; application_email: string | null } | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('full_name,application_email')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { full_name: string | null; application_email: string | null } | null) ?? null;
}

interface GeneratedDoc {
  kind: string;
  title: string;
  content: string | null;
  truthfulnessPassed: boolean;
}

async function loadPackage(userId: string, applicationId: string): Promise<GeneratedDoc[]> {
  const { data } = await supabaseAdmin
    .from('generated_documents')
    .select('kind,title,content,source_facts')
    .eq('user_id', userId)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  return ((data ?? []) as Array<{
    kind: string;
    title: string;
    content: string | null;
    source_facts: { truthfulnessPassed?: boolean } | null;
  }>).map((d) => ({
    kind: d.kind,
    title: d.title,
    content: d.content,
    truthfulnessPassed: d.source_facts?.truthfulnessPassed === true,
  }));
}

async function masterCvSignedUrl(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('documents')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('kind', 'MASTER_CV')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return null;
  const { data: signed } = await supabaseAdmin.storage.from('career-documents').createSignedUrl(path, 3600);
  return signed?.signedUrl ?? null;
}

function jobExpired(job: JobRow): boolean {
  if (!job.created_at) return false;
  return Date.now() - new Date(job.created_at).getTime() > JOB_EXPIRY_MS;
}

async function isEntitled(userId: string): Promise<boolean> {
  try {
    await assertEntitlement(userId, 'automation');
    return true;
  } catch {
    return false;
  }
}

/** M3/go-live: an activated free account is entitled to auto-apply through
 *  its ledger credits (5 a month after the free card verification). The
 *  ledger then meters every confirmed submission (reserve/consume/release
 *  below). Paid plans stay entitled through the plan gate as before. */
async function hasAutoApplyCredits(userId: string): Promise<boolean> {
  if (!ledgerEnabled()) return false;
  try {
    return (await creditAvailable(userId, 'AUTO_APPLY')) > 0;
  } catch {
    return false;
  }
}

export async function processApplicationTask(payload: Record<string, unknown>, taskId?: string): Promise<ApplicationTaskOutcome> {
  const appId = payload.application_id as string | undefined;
  if (!appId) return { status: 'WAITING_APPROVAL', result: { reason: 'MISSING_APPLICATION_ID' } };

  const app = await loadApplication(appId);
  if (!app) return { status: 'WAITING_APPROVAL', result: { reason: 'APPLICATION_NOT_FOUND' } };
  const userId = app.user_id;

  const job = app.job_id ? await loadJob(app.job_id) : null;
  if (!job) return { status: 'WAITING_APPROVAL', result: { reason: 'JOB_NOT_FOUND' } };

  const [prefs, prof, docs, cvUrl] = await Promise.all([
    loadPreferences(userId),
    loadProfile(userId),
    loadPackage(userId, appId),
    masterCvSignedUrl(userId),
  ]);

  const adapter = detectApplyAdapter(job.url ?? '');
  const autoMode = prefs?.application_mode === 'auto';
  const decision = decideAutoSubmit({
    automationEnabled: process.env.AUTOMATION_SUBMIT_ENABLED === 'true',
    agentPaused: prefs?.active === false,
    appStatus: app.status,
    autoMode,
    entitled: (await isEntitled(userId)) || (await hasAutoApplyCredits(userId)),
    adapterSupported: !!adapter,
    hasEmail: !!(prof?.application_email || app.email),
    hasPackage: docs.length > 0 || !!cvUrl,
    truthfulnessOk: docs.every((d) => d.truthfulnessPassed),
    jobExpired: jobExpired(job),
  });

  if (!decision.ok) {
    return { status: 'WAITING_APPROVAL', result: { reason: decision.code, message: messageForGate(decision.code) } };
  }

  // B-181: re-verify the approval against the CURRENT package at run time.
  // A package edited after approval (or an approval older than 24h) reverts
  // the application to AWAITING_APPROVAL; nothing is submitted. This binds
  // APPROVAL-mode sends only: an 'auto' send policy has no approval snapshot
  // to verify, and every other gate above has already re-run.
  const verification = autoMode ? { ok: true as const, snapshot: null } : await verifyApprovalAndRevert(userId, appId);
  if (!verification.ok) {
    return {
      status: 'WAITING_APPROVAL',
      result: {
        reason: verification.code,
        message:
          verification.code === 'APPROVAL_EXPIRED'
            ? 'Your approval expired after 24 hours. Review and approve again.'
            : 'Your package changed since you approved it. Review and approve again.',
      },
    };
  }

  // B-224 capability gate: deny-by-default policy + global dry-run switch.
  const capability = await checkCapabilityAudited('application.auto_submit', {
    automationEnabled: process.env.AUTOMATION_SUBMIT_ENABLED === 'true',
    dryRun: agentDryRun(),
  }, { userId, applicationId: appId });
  if (!capability.allowed) {
    return {
      status: 'WAITING_APPROVAL',
      result: { reason: capability.reason, message: 'Automatic submission is blocked by policy.' },
    };
  }

  // Milestone 2 credit ledger (owner decision D3): hold one AUTO_APPLY
  // credit for this submission attempt. Every gate above has already passed,
  // so a hold here means a real browser submission is about to happen. The
  // reference is per application AND per task, so a re-queued retry gets a
  // fresh hold while a confirmed submission can never be charged twice
  // (idempotency key). Inert until ENTITLEMENTS_LEDGER=true.
  const ledgerRef = `app:${appId}${taskId ? `:${taskId}` : ''}`;
  let held = false;
  if (ledgerEnabled()) {
    try {
      await reserveCredit(userId, 'AUTO_APPLY', ledgerRef);
      held = true;
    } catch (err) {
      if (err instanceof CreditExhaustedError) {
        // Stopped safely like any other pre-submit stop: the user sees the
        // reason on the application; no retry storm (credits only return
        // with the next period or payment).
        const message = 'Monthly auto-apply limit reached for your plan.';
        await supabaseAdmin.from('applications').update({ error: message }).eq('id', appId).eq('user_id', userId);
        await appendApplicationEvent(userId, appId, 'AUTO_SUBMIT_STOPPED', { code: 'AUTO_APPLY_CREDITS_EXHAUSTED', message });
        return { status: 'SUCCEEDED', result: { outcome: 'STOP', code: 'AUTO_APPLY_CREDITS_EXHAUSTED', message } };
      }
      throw err;
    }
  }

  const email = prof?.application_email || app.email;
  const candidate: ApplyCandidate = {
    jobUrl: job.url!,
    company: job.company ?? '',
    title: job.title ?? '',
    email,
    name: prof?.full_name ?? null,
    phone: null,
    cvPath: null,
    cvDownloadUrl: cvUrl,
    coverLetter: docs.find((d) => d.kind === 'COVER_LETTER')?.content ?? null,
    answers: docs
      .filter((d) => d.kind === 'ANSWERS')
      .flatMap((d) => {
        try {
          const parsed = JSON.parse(d.content ?? '{}') as { answers?: { question?: string; answer?: string }[] };
          return (parsed.answers ?? []).map((a) => ({ question: a.question ?? '', answer: a.answer ?? '' }));
        } catch {
          return [];
        }
      }),
  };

  let outcome: Awaited<ReturnType<typeof submitViaBrowser>>;
  try {
    outcome = await submitViaBrowser({
      jobUrl: candidate.jobUrl,
      allowedDomains: adapter!.domains,
      candidate,
    });
  } catch (err) {
    // The attempt failed before any outcome was recorded: give the held
    // credit back, then let the pipeline's retry logic take over.
    if (held) await releaseCredit(userId, 'AUTO_APPLY', ledgerRef).catch(() => {});
    throw err;
  }

  if (outcome.outcome === 'SUBMITTED') {
    if (held) {
      // Confirmed submission: spend the held credit. Best-effort like the
      // document meter's commit: a ledger hiccup must not turn a real
      // submission into a failure. If the consume could not be confirmed,
      // release as cleanup so the hold does not linger.
      try {
        await consumeCredit(userId, 'AUTO_APPLY', ledgerRef);
      } catch (err) {
        console.error('ledger consume failed', { userId, ledgerRef, err: String(err).slice(0, 200) });
        await releaseCredit(userId, 'AUTO_APPLY', ledgerRef).catch(() => {});
      }
    }
    await supabaseAdmin
      .from('applications')
      .update({ status: 'SUBMITTED', submitted_at: new Date().toISOString(), error: null })
      .eq('id', appId)
      .eq('user_id', userId);
    await appendApplicationEvent(userId, appId, 'SUBMITTED', {
      method: 'automated',
      confirmation: outcome.confirmation,
      url: outcome.url,
    });
    // Owner requirement (2026-09-21): once the agent finishes an application,
    // email the user a "submitted on your behalf" notice with a pipeline link.
    // Best-effort: a notification failure never fails the submission.
    let notified = false;
    try {
      const sent = await sendApplicationSubmittedEmail(email, {
        firstName: prof?.full_name?.split(' ')[0],
        jobTitle: job.title ?? 'the role',
        company: job.company ?? 'the company',
        pipelineUrl: `${SITE_URL}/applications`,
        confirmation: outcome.confirmation ?? null,
        mode: autoMode ? 'auto' : 'approval',
      });
      notified = sent.ok;
    } catch {
      notified = false;
    }
    return { status: 'SUCCEEDED', result: { outcome: 'SUBMITTED', confirmation: outcome.confirmation, notified } };
  }

  // B-186: unknown result (worker timeout mid-submit). Never auto-retry.
  // The application stays APPROVED (not SUBMITTED: unconfirmed), flagged for
  // the user to reconcile manually on the employer site.
  if (outcome.outcome === 'UNKNOWN') {
    // Never charge for an unconfirmed submission (D3: consume on confirmed
    // completion only).
    if (held) await releaseCredit(userId, 'AUTO_APPLY', ledgerRef).catch(() => {});
    // M4: park it explicitly. AWAITING_VERIFICATION is never auto-resubmitted.
    await supabaseAdmin
      .from('applications')
      .update({ status: 'AWAITING_VERIFICATION', error: outcome.message })
      .eq('id', appId)
      .eq('user_id', userId);
    await appendApplicationEvent(userId, appId, 'AUTO_SUBMIT_UNKNOWN', {
      code: outcome.code,
      message: outcome.message,
    });
    return { status: 'SUCCEEDED', result: { outcome: 'UNKNOWN', code: outcome.code, message: outcome.message } };
  }

  // Stopped safely: record the reason on the application so the user sees it,
  // and mark the task done (no retry storm on a CAPTCHA). No submission was
  // sent, so the held credit goes back. M4: the application parks in
  // AWAITING_USER_INPUT, the honest state for "the robot stopped here".
  if (held) await releaseCredit(userId, 'AUTO_APPLY', ledgerRef).catch(() => {});
  await supabaseAdmin
    .from('applications')
    .update({ status: 'AWAITING_USER_INPUT', error: outcome.message })
    .eq('id', appId)
    .eq('user_id', userId);
  await appendApplicationEvent(userId, appId, 'AUTO_SUBMIT_STOPPED', { code: outcome.code, message: outcome.message });
  return { status: 'SUCCEEDED', result: { outcome: 'STOP', code: outcome.code, message: outcome.message } };
}
