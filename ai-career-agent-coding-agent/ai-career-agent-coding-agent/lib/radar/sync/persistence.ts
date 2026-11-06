/**
 * Phase 3 - Production Persistence, `public.jobs` Bridge, First-Party Sync & Admin Control Plane
 * ==============================================================================================
 * Zero-downtime deployment contract:
 *   - Every query checks `isRadarSchemaMissingError()` so that if Vercel deploys
 *     before SQL migrations `053..056` are executed in Supabase Production, every
 *     route returns `{ migrationPending: true }` cleanly instead of HTTP 500.
 *   - Bridges verified active `radar_jobs` into `public.jobs` (`canonical_radar_job_id`)
 *     so existing Job Match, Saved Jobs, Dashboard, and Auto-Apply continue working
 *     without breaking changes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { recordSourceOutcome } from '@/lib/jobsources/registry';
import type { RadarAtsProvider } from '@/lib/radar/adapters/ats';
import { pollAndCanonicalizeAtsBoard, type PollAtsBoardOutcome } from '@/lib/radar/pipeline/ingest-batch';
import {
  DEFAULT_RADAR_EMBEDDING_MODEL,
  buildRadarJobEmbedding384,
  formatPgVectorLiteral,
  rankRadarOpportunitiesForCandidate,
  type CandidateMatchProfile,
  type RankedPublicRadarOpportunity,
} from '@/lib/radar/matching/semantic-matcher';
import type { DiscoveredSourceCandidate } from '@/lib/radar/discovery/network-scout';
import type { ExclusionRule, RadarJobRow, WorkplaceType } from '@/lib/radar/types';

const RADAR_ATS_PROVIDERS = new Set<string>([
  'greenhouse',
  'lever',
  'lever_eu',
  'ashby',
  'workable',
  'recruitee',
  'personio',
  'pinpoint',
  'gem',
  'polymer',
  'breezy',
  'teamtailor',
]);

export function isRadarSchemaMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; details?: string };
  const code = String(e.code ?? '');
  if (code === '42P01' || code === '42703' || code === '42883' || code === 'PGRST205' || code === 'PGRST202') {
    return true;
  }
  const msg = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  return (
    msg.includes('radar_') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  );
}

export interface PersistBatchResult {
  migrationPending: boolean;
  upsertedCount: number;
  bridgedCount: number;
  candidatesQueued: number;
}

/**
 * Persist a completed `pollAndCanonicalizeAtsBoard` batch into Supabase (`radar_jobs`,
 * `radar_job_embeddings`, `radar_verification_evidence`, `radar_source_candidates`,
 * `radar_crawl_runs`, and `public.jobs` bridge).
 */
export async function persistCanonicalizedRadarBatch(params: {
  sourceId: string;
  outcome: PollAtsBoardOutcome;
  durationMs: number;
  pollIntervalMinutes?: number;
  db?: SupabaseClient;
}): Promise<PersistBatchResult> {
  const db = params.db ?? supabaseAdmin;
  const { outcome, sourceId } = params;

  let upsertedCount = 0;
  let bridgedCount = 0;
  let candidatesQueued = 0;

  // 1. Upsert canonical `radar_jobs` + `vector(384)` embeddings + bridge to `public.jobs`
  for (const job of outcome.upsertedJobs) {
    const { data: savedRow, error: jobErr } = await db
      .from('radar_jobs')
      .upsert(
        {
          primary_source_id: sourceId,
          canonical_fingerprint: job.canonical_fingerprint,
          requisition_cluster_key: job.requisition_cluster_key,
          canonical_url_hash: job.canonical_url_hash,
          title_company_loc_hash: job.title_company_loc_hash,
          description_simhash: job.description_simhash,
          external_requisition_id: job.external_requisition_id,
          title: job.title,
          normalized_title: job.normalized_title,
          company_name: job.company_name,
          department: job.department,
          career_category: job.career_category,
          seniority_level: job.seniority_level,
          employment_type: job.employment_type,
          workplace_type: job.workplace_type,
          location_raw: job.location_raw,
          normalized_city: job.normalized_city,
          state_region: job.state_region,
          country_code: job.country_code,
          country_codes: job.country_codes,
          remote_region_restriction: job.remote_region_restriction,
          visa_sponsorship: job.visa_sponsorship,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          salary_currency: job.salary_currency,
          salary_period: job.salary_period,
          skills_required: job.skills_required,
          skills_preferred: job.skills_preferred,
          experience_years_min: job.experience_years_min,
          experience_years_max: job.experience_years_max,
          description_clean: job.description_clean,
          content_hash: job.content_hash,
          extraction_method: job.extraction_method,
          apply_url: job.apply_url,
          canonical_apply_url: job.canonical_apply_url,
          apply_mechanism: job.apply_mechanism,
          auto_apply_adapter: job.auto_apply_adapter,
          requires_human_form_review: job.requires_human_form_review,
          employer_verification_status: job.employer_verification_status,
          vacancy_authenticity_status: job.vacancy_authenticity_status,
          verified_by_deterministic_evidence: job.verified_by_deterministic_evidence,
          employer_legitimacy_score: job.employer_legitimacy_score,
          job_authenticity_score: job.job_authenticity_score,
          application_safety_score: job.application_safety_score,
          verification_status: job.verification_status,
          risk_flags: job.risk_flags,
          lifecycle_status: job.lifecycle_status,
          missing_poll_streak: job.missing_poll_streak,
          first_missing_at: job.first_missing_at,
          closure_signal: job.closure_signal,
          posted_at: job.posted_at,
          valid_through: job.valid_through,
          last_seen_at: job.last_seen_at,
          last_confirmed_live_at: job.last_confirmed_live_at,
          expired_at: job.expired_at,
          discovery_origin: job.discovery_origin,
          first_direct_seen_at: job.first_direct_seen_at,
          first_syndicated_seen_at: job.first_syndicated_seen_at,
          lead_time_hours: job.lead_time_hours,
          exclusivity_tier: job.exclusivity_tier,
          attribution_text: job.attribution_text,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'canonical_fingerprint' },
      )
      .select('id, content_hash')
      .maybeSingle();

    if (jobErr) {
      if (isRadarSchemaMissingError(jobErr)) {
        return { migrationPending: true, upsertedCount: 0, bridgedCount: 0, candidatesQueued: 0 };
      }
      continue;
    }

    const radarJobId = (savedRow as { id?: string } | null)?.id;
    if (!radarJobId) continue;
    upsertedCount += 1;

    const externalKey = job.external_requisition_id || job.canonical_fingerprint.slice(0, 32);

    // 1b. Record source provenance (`radar_job_sources`) & deterministic attestation (`radar_verification_evidence`)
    await db.from('radar_job_sources').upsert(
      {
        radar_job_id: radarJobId,
        source_id: sourceId,
        external_id: externalKey,
        source_url: job.apply_url,
        is_direct_employer_source: job.discovery_origin !== 'PUBLIC_AGGREGATOR_FEED',
        attribution_text: job.attribution_text,
        raw_payload_hash: job.content_hash,
        missing_poll_streak: job.missing_poll_streak,
        last_seen_at: job.last_seen_at,
      },
      { onConflict: 'source_id,external_id' },
    );

    if (job.verified_by_deterministic_evidence) {
      const evidenceHash = crypto
        .createHash('sha256')
        .update(`${sourceId}:${externalKey}:OFFICIAL_ATS_PUBLIC_API_ATTESTATION`)
        .digest('hex');
      await db.from('radar_verification_evidence').upsert(
        {
          subject_type: 'JOB',
          subject_id: radarJobId,
          evidence_kind: 'OFFICIAL_ATS_PUBLIC_API_ATTESTATION',
          is_deterministic: true,
          direction: 'POSITIVE',
          score_delta: 35,
          evidence_summary: `Attested directly by authorized ${sourceId} public posting endpoint`,
          evidence_hash: evidenceHash,
        },
        { onConflict: 'subject_type,subject_id,evidence_kind,evidence_hash', ignoreDuplicates: true },
      );
    }

    // 2. Upsert `vector(384)` semantic embedding for active non-quarantined jobs
    if (
      job.lifecycle_status === 'ACTIVE' &&
      job.verification_status !== 'SCAM_REJECTED' &&
      job.verification_status !== 'SUSPICIOUS_QUARANTINE'
    ) {
      const vec384 = buildRadarJobEmbedding384(job);
      await db.from('radar_job_embeddings').upsert(
        {
          radar_job_id: radarJobId,
          embedding: formatPgVectorLiteral(vec384),
          embedding_model: DEFAULT_RADAR_EMBEDDING_MODEL,
          content_hash: job.content_hash,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'radar_job_id' },
      );

      // 3. Bridge verified active jobs into `public.jobs` so existing Jobiest surfaces benefit
      if (job.verified_by_deterministic_evidence) {
        const providerUpper = sourceId.split(':')[0]?.toUpperCase() || 'RADAR';
        const { error: bridgeErr } = await db.from('jobs').upsert(
          {
            source: providerUpper,
            external_id: externalKey,
            company: job.company_name,
            title: job.title,
            url: job.apply_url,
            description: job.description_clean,
            location: job.location_raw,
            last_seen_at: job.last_seen_at,
            content_hash: job.content_hash,
            canonical_radar_job_id: radarJobId,
            metadata: {
              workplaceType: job.workplace_type,
              exclusivityTier: job.exclusivity_tier,
              verificationStatus: job.verification_status,
              requiresHumanFormReview: job.requires_human_form_review,
            },
          },
          { onConflict: 'source,external_id' },
        );
        if (!bridgeErr) bridgedCount += 1;
      }
    }
  }

  // 4. Queue newly discovered outbound hiring infrastructure (`radar_source_candidates`)
  for (const infra of outcome.discoveredInfrastructure) {
    try {
      const host = new URL(infra.canonicalSourceUrl).hostname.toLowerCase().replace(/^www\./, '');
      const { error: candErr } = await db.from('radar_source_candidates').upsert(
        {
          discovered_url: infra.canonicalSourceUrl,
          normalized_host: host,
          detected_provider: infra.providerKey,
          detected_board_token: infra.boardOrFormToken,
          discovery_channel: 'EMPLOYER_HOMEPAGE_LINK',
        },
        { onConflict: 'discovered_url', ignoreDuplicates: true },
      );
      if (!candErr) candidatesQueued += 1;
    } catch {
      // ignore malformed URL
    }
  }

  // 5. Record crawl run telemetry (`radar_crawl_runs`) + update `job_sources` ETag/hash
  const { error: runErr } = await db.from('radar_crawl_runs').insert({
    source_id: sourceId,
    outcome: outcome.runOutcome,
    http_status: outcome.httpStatus,
    bytes_fetched: outcome.bytesFetched,
    items_seen: outcome.upsertedJobs.length,
    items_created: upsertedCount,
    items_updated: 0,
    items_expired: outcome.upsertedJobs.filter((j) => j.lifecycle_status === 'EXPIRED').length,
    ai_tokens_used: 0,
    duration_ms: Math.max(0, Math.round(params.durationMs)),
    error_code: outcome.errorCode,
  });

  if (runErr && isRadarSchemaMissingError(runErr)) {
    return { migrationPending: true, upsertedCount: 0, bridgedCount: 0, candidatesQueued: 0 };
  }

  if (
    outcome.runOutcome === 'OK_COMPLETE' ||
    outcome.runOutcome === 'NOT_MODIFIED_304' ||
    outcome.runOutcome === 'UNCHANGED_HASH'
  ) {
    const intervalMins = Math.max(15, params.pollIntervalMinutes ?? 240);
    await db
      .from('job_sources')
      .update({
        etag: outcome.etag,
        last_modified_header: outcome.lastModifiedHeader,
        last_payload_hash: outcome.payloadHash,
        last_item_count:
          outcome.runOutcome === 'OK_COMPLETE' ? outcome.upsertedJobs.length : undefined,
        last_complete_poll_at:
          outcome.runOutcome === 'OK_COMPLETE' ? new Date().toISOString() : undefined,
        next_poll_at: new Date(Date.now() + intervalMins * 60_000).toISOString(),
        lease_token: null,
        lease_expires_at: null,
      })
      .eq('id', sourceId);
  }

  return { migrationPending: false, upsertedCount, bridgedCount, candidatesQueued };
}

/**
 * Queue externally scouted source candidates (HN Who is Hiring, CT logs, Common Crawl CDX)
 * into `radar_source_candidates` idempotently.
 */
export async function enqueueDiscoveredSourceCandidates(
  candidates: DiscoveredSourceCandidate[],
  db: SupabaseClient = supabaseAdmin,
): Promise<{ migrationPending: boolean; inserted: number }> {
  let inserted = 0;
  for (const c of candidates) {
    const { error } = await db.from('radar_source_candidates').upsert(
      {
        discovered_url: c.discoveredUrl,
        normalized_host: c.normalizedHost,
        detected_provider: c.detectedProvider,
        detected_board_token: c.detectedBoardToken,
        employer_domain_hint: c.employerDomainHint,
        discovery_channel: c.discoveryChannel,
      },
      { onConflict: 'discovered_url', ignoreDuplicates: true },
    );
    if (error) {
      if (isRadarSchemaMissingError(error)) return { migrationPending: true, inserted: 0 };
      continue;
    }
    inserted += 1;
  }
  return { migrationPending: false, inserted };
}

/**
 * Application-layer First-Party Employer Vacancy sync companion (calls SQL RPC
 * `sync_recruitment_vacancy_to_radar_by_id` non-blockingly when `056` is live).
 */
export async function syncEmployerVacancyToRadarById(
  vacancyId: string,
  db: SupabaseClient = supabaseAdmin,
): Promise<{ synced: boolean; migrationPending: boolean; radarJobId: string | null }> {
  try {
    const { data, error } = await db.rpc('sync_recruitment_vacancy_to_radar_by_id', {
      p_vacancy_id: vacancyId,
    });
    if (error) {
      if (isRadarSchemaMissingError(error)) {
        return { synced: false, migrationPending: true, radarJobId: null };
      }
      return { synced: false, migrationPending: false, radarJobId: null };
    }
    return { synced: Boolean(data), migrationPending: false, radarJobId: (data as string | null) ?? null };
  } catch {
    return { synced: false, migrationPending: false, radarJobId: null };
  }
}

/**
 * Bounded Radar sweep: claims up to `maxSources` due compliant ATS sources from
 * `job_sources`, runs `pollAndCanonicalizeAtsBoard`, and persists results.
 */
export async function runBoundedRadarSweep(opts: {
  maxSources?: number;
  db?: SupabaseClient;
  fetchImpl?: typeof fetch;
} = {}): Promise<{
  migrationPending: boolean;
  sourcesPolled: number;
  upsertedCount: number;
  bridgedCount: number;
  outcomes: Array<{ sourceId: string; outcome: string; upserted: number }>;
}> {
  const db = opts.db ?? supabaseAdmin;
  const maxSources = Math.max(1, Math.min(15, opts.maxSources ?? 4));

  // Load active exclusion rules if `053` is applied
  const { data: exclRows, error: exclErr } = await db
    .from('radar_exclusions')
    .select('pattern_type, pattern_value, reason, active')
    .eq('active', true);

  if (exclErr && isRadarSchemaMissingError(exclErr)) {
    return { migrationPending: true, sourcesPolled: 0, upsertedCount: 0, bridgedCount: 0, outcomes: [] };
  }

  const exclusionRules: ExclusionRule[] = ((exclRows ?? []) as Array<{
    pattern_type: ExclusionRule['patternType'];
    pattern_value: string;
    reason: ExclusionRule['reason'];
    active: boolean;
  }>).map((r) => ({
    patternType: r.pattern_type,
    patternValue: r.pattern_value,
    reason: r.reason,
    active: r.active,
  }));

  const { data: claimed, error: claimErr } = await db.rpc('claim_due_radar_sources', {
    p_limit: maxSources,
    p_lease_seconds: 180,
  });

  if (claimErr) {
    if (isRadarSchemaMissingError(claimErr)) {
      return { migrationPending: true, sourcesPolled: 0, upsertedCount: 0, bridgedCount: 0, outcomes: [] };
    }
    return { migrationPending: false, sourcesPolled: 0, upsertedCount: 0, bridgedCount: 0, outcomes: [] };
  }

  const dueRows = (claimed ?? []) as Array<{
    id: string;
    adapter: string;
    board: string;
    enabled: boolean;
    poll_interval_minutes?: number | null;
    etag?: string | null;
    last_modified_header?: string | null;
    last_payload_hash?: string | null;
    last_item_count?: number | null;
  }>;

  let totalUpserted = 0;
  let totalBridged = 0;
  const outcomes: Array<{ sourceId: string; outcome: string; upserted: number }> = [];

  for (const src of dueRows) {
    if (!RADAR_ATS_PROVIDERS.has(src.adapter)) continue;
    const started = Date.now();

    const { data: existingRows } = await db
      .from('radar_jobs')
      .select('*')
      .eq('primary_source_id', src.id)
      .in('lifecycle_status', ['ACTIVE', 'POTENTIALLY_CLOSING'])
      .limit(500);

    const pollRes = await pollAndCanonicalizeAtsBoard({
      provider: src.adapter as RadarAtsProvider,
      boardToken: src.board,
      enabled: src.enabled,
      previousEtag: src.etag ?? null,
      previousLastModified: src.last_modified_header ?? null,
      previousPayloadHash: src.last_payload_hash ?? null,
      previousItemCount: src.last_item_count ?? null,
      existingJobs: (existingRows ?? []) as RadarJobRow[],
      exclusionRules,
      fetchImpl: opts.fetchImpl,
    });

    const persisted = await persistCanonicalizedRadarBatch({
      sourceId: src.id,
      outcome: pollRes,
      durationMs: Date.now() - started,
      pollIntervalMinutes: src.poll_interval_minutes ?? 240,
      db,
    });

    const healthy =
      pollRes.runOutcome === 'OK_COMPLETE' ||
      pollRes.runOutcome === 'NOT_MODIFIED_304' ||
      pollRes.runOutcome === 'UNCHANGED_HASH';
    await recordSourceOutcome(src.id, healthy);

    totalUpserted += persisted.upsertedCount;
    totalBridged += persisted.bridgedCount;
    outcomes.push({
      sourceId: src.id,
      outcome: pollRes.runOutcome,
      upserted: persisted.upsertedCount,
    });
  }

  return {
    migrationPending: false,
    sourcesPolled: outcomes.length,
    upsertedCount: totalUpserted,
    bridgedCount: totalBridged,
    outcomes,
  };
}

/**
 * Load & rank verified Radar opportunities for a signed-in candidate.
 */
export async function listRankedOpportunitiesForUser(params: {
  userId: string;
  query?: string | null;
  workplaceType?: WorkplaceType | null;
  countryCode?: string | null;
  exclusivityOnly?: boolean;
  verifiedOnly?: boolean;
  limit?: number;
  db?: SupabaseClient;
}): Promise<{
  migrationPending: boolean;
  opportunities: RankedPublicRadarOpportunity[];
}> {
  const db = params.db ?? supabaseAdmin;
  const limit = Math.max(1, Math.min(60, params.limit ?? 25));

  let jobQuery = db
    .from('radar_jobs')
    .select('*')
    .in('lifecycle_status', ['ACTIVE', 'POTENTIALLY_CLOSING'])
    .not('verification_status', 'in', '("SCAM_REJECTED","SUSPICIOUS_QUARANTINE","TAKEDOWN")')
    .order('composite_confidence', { ascending: false })
    .order('first_seen_at', { ascending: false })
    .limit(200);

  if (params.workplaceType) {
    jobQuery = jobQuery.eq('workplace_type', params.workplaceType);
  }
  if (params.countryCode) {
    jobQuery = jobQuery.eq('country_code', params.countryCode.toUpperCase());
  }
  if (params.query && params.query.trim()) {
    const safeQ = params.query.replace(/[%_(),]/g, ' ').trim();
    if (safeQ) {
      jobQuery = jobQuery.or(`title.ilike.%${safeQ}%,company_name.ilike.%${safeQ}%`);
    }
  }

  const { data: rows, error } = await jobQuery;
  if (error) {
    if (isRadarSchemaMissingError(error)) {
      return { migrationPending: true, opportunities: [] };
    }
    throw error;
  }

  // Load candidate preferences & career profile best-effort for personalized ranking
  const [{ data: prefs }, { data: career }] = await Promise.all([
    db
      .from('job_preferences')
      .select('target_roles, preferred_locations, remote_only, min_salary, salary_currency')
      .eq('user_id', params.userId)
      .maybeSingle(),
    db
      .from('career_profiles')
      .select('headline, summary, skills')
      .eq('user_id', params.userId)
      .maybeSingle(),
  ]);

  const prefRow = (prefs ?? {}) as {
    target_roles?: string[];
    preferred_locations?: string[];
    remote_only?: boolean;
    min_salary?: number | null;
    salary_currency?: string | null;
  };
  const careerRow = (career ?? {}) as {
    headline?: string | null;
    summary?: string | null;
    skills?: string[];
  };

  const profile: CandidateMatchProfile = {
    targetRoles: [
      ...(params.query ? [params.query] : []),
      ...(Array.isArray(prefRow.target_roles) ? prefRow.target_roles : []),
      ...(careerRow.headline ? [careerRow.headline] : []),
    ],
    skills: Array.isArray(careerRow.skills) ? careerRow.skills : [],
    preferredLocations: Array.isArray(prefRow.preferred_locations) ? prefRow.preferred_locations : [],
    countryCode: params.countryCode ?? null,
    preferredWorkplaceTypes: params.workplaceType
      ? [params.workplaceType]
      : prefRow.remote_only
        ? ['REMOTE']
        : [],
    minAnnualSalary: typeof prefRow.min_salary === 'number' ? prefRow.min_salary : null,
    salaryCurrency: prefRow.salary_currency ?? null,
    summaryText: careerRow.summary ?? null,
  };

  const ranked = rankRadarOpportunitiesForCandidate({
    jobs: (rows ?? []) as RadarJobRow[],
    profile,
    exclusivityOnly: params.exclusivityOnly ?? false,
    verifiedOnly: params.verifiedOnly ?? false,
    limit,
  });

  return { migrationPending: false, opportunities: ranked };
}

export interface AdminRadarDashboardData {
  migrationPending: boolean;
  summary: {
    total_active_jobs: number;
    potentially_closing_jobs: number;
    first_party_exclusive_count: number;
    first_mover_exclusive_count: number;
    early_direct_count: number;
    syndicated_count: number;
    avg_lead_time_hours: number | null;
    verified_employers_count: number;
    pending_source_candidates_count: number;
    scams_rejected_count: number;
    active_exclusions_count: number;
    inspected_forms_count: number;
    assisted_preparations_count: number;
    active_alert_subscribers_count: number;
  };
  providerPolicies: Array<Record<string, unknown>>;
  recentRuns: Array<Record<string, unknown>>;
  pendingCandidates: Array<Record<string, unknown>>;
  exclusions: Array<Record<string, unknown>>;
  verifiedEmployers: Array<Record<string, unknown>>;
}

const EMPTY_SUMMARY: AdminRadarDashboardData['summary'] = {
  total_active_jobs: 0,
  potentially_closing_jobs: 0,
  first_party_exclusive_count: 0,
  first_mover_exclusive_count: 0,
  early_direct_count: 0,
  syndicated_count: 0,
  avg_lead_time_hours: null,
  verified_employers_count: 0,
  pending_source_candidates_count: 0,
  scams_rejected_count: 0,
  active_exclusions_count: 0,
  inspected_forms_count: 0,
  assisted_preparations_count: 0,
  active_alert_subscribers_count: 0,
};

export async function getAdminRadarDashboardData(
  db: SupabaseClient = supabaseAdmin,
): Promise<AdminRadarDashboardData> {
  const { data: summaryData, error: summaryErr } = await db.rpc('get_radar_intelligence_summary');
  if (summaryErr && isRadarSchemaMissingError(summaryErr)) {
    // Check if 053..055 exist even if 056 RPC is not yet applied
    const { error: probeErr } = await db.from('radar_provider_policies').select('provider_key').limit(1);
    if (probeErr && isRadarSchemaMissingError(probeErr)) {
      return {
        migrationPending: true,
        summary: EMPTY_SUMMARY,
        providerPolicies: [],
        recentRuns: [],
        pendingCandidates: [],
        exclusions: [],
        verifiedEmployers: [],
      };
    }
  }

  const [policiesRes, runsRes, candidatesRes, exclusionsRes, employersRes] = await Promise.all([
    db.from('radar_provider_policies').select('*').order('provider_key', { ascending: true }),
    db.from('radar_crawl_runs').select('*').order('started_at', { ascending: false }).limit(25),
    db
      .from('radar_source_candidates')
      .select('*')
      .eq('review_status', 'QUEUED_VALIDATION')
      .order('first_seen_at', { ascending: false })
      .limit(30),
    db.from('radar_exclusions').select('*').eq('active', true).order('created_at', { ascending: false }).limit(30),
    db
      .from('radar_employers')
      .select('id, canonical_name, normalized_slug, primary_domain, website_url, careers_url, country_code, region, industry, company_size_band, employer_legitimacy_score, employer_verification_status, hiring_infrastructure, created_at')
      .order('canonical_name', { ascending: true })
      .limit(120),
  ]);

  if (policiesRes.error && isRadarSchemaMissingError(policiesRes.error)) {
    return {
      migrationPending: true,
      summary: EMPTY_SUMMARY,
      providerPolicies: [],
      recentRuns: [],
      pendingCandidates: [],
      exclusions: [],
      verifiedEmployers: [],
    };
  }

  return {
    migrationPending: false,
    summary: {
      ...EMPTY_SUMMARY,
      ...((summaryData && typeof summaryData === 'object' ? summaryData : {}) as Partial<
        AdminRadarDashboardData['summary']
      >),
    },
    providerPolicies: (policiesRes.data ?? []) as Array<Record<string, unknown>>,
    recentRuns: (runsRes.data ?? []) as Array<Record<string, unknown>>,
    pendingCandidates: (candidatesRes.data ?? []) as Array<Record<string, unknown>>,
    exclusions: (exclusionsRes.data ?? []) as Array<Record<string, unknown>>,
    verifiedEmployers: (employersRes.data ?? []) as Array<Record<string, unknown>>,
  };
}
