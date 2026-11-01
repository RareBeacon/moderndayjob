/**
 * Phase 6 - Autonomous Global Employment Intelligence Network Orchestrator
 * ========================================================================
 * Executes one bounded, idempotent, zero-paid-service network cycle:
 *   1. Network Discovery Scout: Fetches latest Hacker News "Who is hiring?"
 *      thread via public Algolia API and extracts direct ATS boards + forms.
 *   2. Safe Candidate Promotion: Calls `promote_validated_radar_candidates`
 *      for verified public ATS embed providers with zero active exclusions.
 *   3. Multi-Source Sweep: Polls due ATS boards (`runBoundedRadarSweep`) AND
 *      due authorized `jsonld_career` corporate career pages (`pollAndCanonicalizeCareerPage`).
 *   4. First-Mover Candidate Alerts: Dispatches deduplicated high-confidence
 *      opportunity alerts (`dispatchRadarCandidateAlerts`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordSourceOutcome } from '@/lib/jobsources/registry';
import { dispatchRadarCandidateAlerts, type AlertDispatchSummary } from '@/lib/radar/alerts/dispatcher';
import {
  parseCrtShCertificatesJson,
  parseHnWhoIsHiringItemJson,
} from '@/lib/radar/discovery/network-scout';
import { conditionalSafeFetch } from '@/lib/radar/http/fetcher';
import { pollAndCanonicalizeCareerPage } from '@/lib/radar/pipeline/career-page-poller';
import {
  enqueueDiscoveredSourceCandidates,
  isRadarSchemaMissingError,
  persistCanonicalizedRadarBatch,
  runBoundedRadarSweep,
} from '@/lib/radar/sync/persistence';
import { supabaseAdmin } from '@/lib/supabase';
import type { ExclusionRule, RadarJobRow } from '@/lib/radar/types';

export interface AutonomousRadarCycleReport {
  migrationPending: boolean;
  scoutedCandidatesQueued: number;
  candidatesAutoPromoted: number;
  atsSourcesPolled: number;
  careerPagesPolled: number;
  totalJobsUpserted: number;
  totalJobsBridged: number;
  alerts: AlertDispatchSummary;
}

async function scoutLatestHnHiringThread(params: {
  db: SupabaseClient;
  fetchImpl?: typeof fetch;
}): Promise<number> {
  try {
    const searchRes = await conditionalSafeFetch({
      url: 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Who%20is%20hiring&hitsPerPage=1',
      fetchImpl: params.fetchImpl,
      maxBytes: 256 * 1024,
      timeoutMs: 8000,
    });
    if (searchRes.outcome !== 'OK_MODIFIED' || !searchRes.bodyText) return 0;

    const searchJson = JSON.parse(searchRes.bodyText) as {
      hits?: Array<{ objectID?: string }>;
    };
    const latestId = searchJson.hits?.[0]?.objectID;
    if (!latestId || !/^\d+$/.test(latestId)) return 0;

    const itemRes = await conditionalSafeFetch({
      url: `https://hn.algolia.com/api/v1/items/${latestId}`,
      fetchImpl: params.fetchImpl,
      maxBytes: 4 * 1024 * 1024,
      timeoutMs: 12_000,
    });
    if (itemRes.outcome !== 'OK_MODIFIED' || !itemRes.bodyText) return 0;

    const parsed = parseHnWhoIsHiringItemJson(itemRes.bodyText);
    if (parsed.discoveredCandidates.length === 0) return 0;

    const queued = await enqueueDiscoveredSourceCandidates(parsed.discoveredCandidates.slice(0, 100), params.db);
    return queued.inserted;
  } catch {
    return 0;
  }
}

async function scoutVerifiedEmployerCtSubdomains(params: {
  db: SupabaseClient;
  fetchImpl?: typeof fetch;
  maxDomains?: number;
}): Promise<number> {
  try {
    const { data: employers } = await params.db
      .from('radar_employers')
      .select('primary_domain')
      .in('employer_verification_status', ['EVIDENCE_VERIFIED', 'FIRST_PARTY_VERIFIED'])
      .not('primary_domain', 'is', null)
      .limit(Math.max(1, Math.min(5, params.maxDomains ?? 2)));

    let queuedTotal = 0;
    for (const emp of (employers ?? []) as Array<{ primary_domain: string | null }>) {
      const dom = emp.primary_domain?.trim().toLowerCase();
      if (!dom || !/^[a-z0-9.-]+\.[a-z]{2,20}$/.test(dom)) continue;

      const crtRes = await conditionalSafeFetch({
        url: `https://crt.sh/?q=%25.${encodeURIComponent(dom)}&output=json`,
        fetchImpl: params.fetchImpl,
        maxBytes: 1024 * 1024,
        timeoutMs: 8000,
      });
      if (crtRes.outcome !== 'OK_MODIFIED' || !crtRes.bodyText) continue;

      const cands = parseCrtShCertificatesJson(crtRes.bodyText);
      if (cands.length > 0) {
        const res = await enqueueDiscoveredSourceCandidates(cands.slice(0, 10), params.db);
        queuedTotal += res.inserted;
      }
    }
    return queuedTotal;
  } catch {
    return 0;
  }
}

export async function pollDueCareerPageSources(opts: {
  maxPages?: number;
  db?: SupabaseClient;
  fetchImpl?: typeof fetch;
} = {}): Promise<{
  pagesPolled: number;
  upsertedCount: number;
  bridgedCount: number;
}> {
  const db = opts.db ?? supabaseAdmin;
  const maxPages = Math.max(1, Math.min(8, opts.maxPages ?? 3));

  const { data: duePages, error } = await db
    .from('job_sources')
    .select('*')
    .eq('adapter', 'jsonld_career')
    .eq('enabled', true)
    .eq('commercial_indexing_allowed', true)
    .lte('next_poll_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .limit(maxPages);

  if (error || !duePages || duePages.length === 0) {
    return { pagesPolled: 0, upsertedCount: 0, bridgedCount: 0 };
  }

  const { data: exclRows } = await db
    .from('radar_exclusions')
    .select('pattern_type, pattern_value, reason, active')
    .eq('active', true);

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

  let pagesPolled = 0;
  let upsertedCount = 0;
  let bridgedCount = 0;

  for (const raw of duePages as Array<Record<string, unknown>>) {
    const sourceId = String(raw.id ?? '');
    const sourceUrl = typeof raw.source_url === 'string' ? raw.source_url : '';
    const boardLabel = String(raw.board ?? sourceId);
    if (!sourceId || !sourceUrl) continue;

    const started = Date.now();
    const { data: existingRows } = await db
      .from('radar_jobs')
      .select('*')
      .eq('primary_source_id', sourceId)
      .in('lifecycle_status', ['ACTIVE', 'POTENTIALLY_CLOSING'])
      .limit(200);

    const outcome = await pollAndCanonicalizeCareerPage({
      sourceId,
      careerPageUrl: sourceUrl,
      companyName: boardLabel,
      enabled: Boolean(raw.enabled),
      previousEtag: (raw.etag as string | null) ?? null,
      previousLastModified: (raw.last_modified_header as string | null) ?? null,
      previousPayloadHash: (raw.last_payload_hash as string | null) ?? null,
      previousItemCount: typeof raw.last_item_count === 'number' ? raw.last_item_count : null,
      existingJobs: (existingRows ?? []) as RadarJobRow[],
      exclusionRules,
      fetchImpl: opts.fetchImpl,
    });

    const persisted = await persistCanonicalizedRadarBatch({
      sourceId,
      outcome,
      durationMs: Date.now() - started,
      pollIntervalMinutes: typeof raw.poll_interval_minutes === 'number' ? raw.poll_interval_minutes : 360,
      db,
    });

    const healthy =
      outcome.runOutcome === 'OK_COMPLETE' ||
      outcome.runOutcome === 'NOT_MODIFIED_304' ||
      outcome.runOutcome === 'UNCHANGED_HASH';
    await recordSourceOutcome(sourceId, healthy);

    pagesPolled += 1;
    upsertedCount += persisted.upsertedCount;
    bridgedCount += persisted.bridgedCount;
  }

  return { pagesPolled, upsertedCount, bridgedCount };
}

export async function runAutonomousRadarCycle(opts: {
  maxAtsSources?: number;
  maxCareerPages?: number;
  enableNetworkScout?: boolean;
  db?: SupabaseClient;
  fetchImpl?: typeof fetch;
} = {}): Promise<AutonomousRadarCycleReport> {
  const db = opts.db ?? supabaseAdmin;

  // Quick schema check
  const { error: probeErr } = await db.from('radar_provider_policies').select('provider_key').limit(1);
  if (probeErr && isRadarSchemaMissingError(probeErr)) {
    return {
      migrationPending: true,
      scoutedCandidatesQueued: 0,
      candidatesAutoPromoted: 0,
      atsSourcesPolled: 0,
      careerPagesPolled: 0,
      totalJobsUpserted: 0,
      totalJobsBridged: 0,
      alerts: { migrationPending: true, subscribersChecked: 0, usersNotified: 0, deliveriesRecorded: 0 },
    };
  }

  let scoutedCandidatesQueued = 0;
  if (opts.enableNetworkScout ?? true) {
    const [hnQueued, ctQueued] = await Promise.all([
      scoutLatestHnHiringThread({ db, fetchImpl: opts.fetchImpl }),
      scoutVerifiedEmployerCtSubdomains({ db, fetchImpl: opts.fetchImpl, maxDomains: 2 }),
    ]);
    scoutedCandidatesQueued = hnQueued + ctQueued;
  }

  let candidatesAutoPromoted = 0;
  try {
    const { data: promotedCount } = await db.rpc('promote_validated_radar_candidates', {
      p_limit: 12,
    });
    if (typeof promotedCount === 'number') {
      candidatesAutoPromoted = promotedCount;
    }
  } catch {
    // RPC optional if 057 not yet applied
  }

  const [atsSweep, careerSweep] = await Promise.all([
    runBoundedRadarSweep({
      maxSources: opts.maxAtsSources ?? 5,
      db,
      fetchImpl: opts.fetchImpl,
    }),
    pollDueCareerPageSources({
      maxPages: opts.maxCareerPages ?? 2,
      db,
      fetchImpl: opts.fetchImpl,
    }),
  ]);

  const alerts = await dispatchRadarCandidateAlerts({ db });

  return {
    migrationPending: false,
    scoutedCandidatesQueued,
    candidatesAutoPromoted,
    atsSourcesPolled: atsSweep.sourcesPolled,
    careerPagesPolled: careerSweep.pagesPolled,
    totalJobsUpserted: atsSweep.upsertedCount + careerSweep.upsertedCount,
    totalJobsBridged: atsSweep.bridgedCount + careerSweep.bridgedCount,
    alerts,
  };
}
