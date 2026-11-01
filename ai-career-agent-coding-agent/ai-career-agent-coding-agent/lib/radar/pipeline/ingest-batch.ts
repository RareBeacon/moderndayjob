import crypto from 'node:crypto';
import type { LookupFn } from '@/lib/agent/ssrf';
import {
  buildAtsBoardEndpointUrl,
  parseAtsFeedPayload,
  type RadarAtsProvider,
} from '../adapters/ats';
import {
  evaluateSourceCompliance,
  type SourceComplianceDecision,
} from '../compliance/policy';
import {
  arePostingsSyndicationDuplicates,
  classifyApplyDestination,
  computeDedupIdentity,
} from '../dedup/canonicalize';
import { conditionalSafeFetch } from '../http/fetcher';
import {
  computeFirstMoverMetrics,
  detectHiringInfrastructureFromUrl,
  type DetectedHiringInfrastructure,
} from '../intelligence/first-mover';
import {
  isAnomalousEmptyBoardDrop,
  stepJobLifecycle,
  type CurrentJobLifecycleState,
} from '../lifecycle/expiration';
import {
  toPublicRadarJobDTO,
  type ExclusionRule,
  type ProviderPolicy,
  type PublicRadarJobDTO,
  type RadarJobRow,
  type RadarPostingInput,
} from '../types';
import {
  evaluateOpportunityVerification,
  type DeterministicEmployerFacts,
  type VerificationEvidenceItem,
} from '../verification/evidence';

/**
 * Pure, dependency-injected Radar Poll & Canonicalization Coordinator
 *
 * Orchestrates Phase 1 + Phase 2 end-to-end without requiring live production
 * database writes during unit/fixture testing:
 *   1. Pre-flight Source Compliance Gate (Condition 1: Exclusions + Provider ToS + robots.txt)
 *   2. DNS-Resolved SSRF + Conditional HTTP Fetch (304 / SHA-256 unchanged short-circuit)
 *   3. Deterministic ATS Parsing (11 authorized providers)
 *   4. Requisition-Preserving 4-Tier Deduplication (Condition 5)
 *   5. Evidence-Backed 3-Axis Verification (Condition 2)
 *   6. Multi-Observation Lifecycle & Anomalous-Drop Protection (Condition 3)
 *   7. First-Mover Lead-Time & Outbound Hiring Infrastructure Discovery
 *   8. Whitelisted Public DTO Projection (Condition 4)
 */

export interface PollAtsBoardInput {
  provider: RadarAtsProvider;
  boardToken: string;
  enabled?: boolean;
  previousEtag?: string | null;
  previousLastModified?: string | null;
  previousPayloadHash?: string | null;
  previousItemCount?: number | null;
  existingJobs?: RadarJobRow[];
  employerFacts?: DeterministicEmployerFacts;
  exclusionRules?: readonly ExclusionRule[];
  providerPolicies?: Record<string, ProviderPolicy>;
  robotsSnapshot?: { httpStatus: number | null; bodyText: string } | null;
  nowIso?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
}

export interface PollAtsBoardOutcome {
  runOutcome:
    | 'OK_COMPLETE'
    | 'NOT_MODIFIED_304'
    | 'UNCHANGED_HASH'
    | 'SKIPPED_COMPLIANCE'
    | 'SKIPPED_ROBOTS'
    | 'ANOMALOUS_EMPTY_DROP'
    | 'HTTP_ERROR'
    | 'NETWORK_OR_SSRF_BLOCKED'
    | 'PARSE_ERROR';
  compliance: SourceComplianceDecision;
  httpStatus: number | null;
  bytesFetched: number;
  etag: string | null;
  lastModifiedHeader: string | null;
  payloadHash: string | null;
  upsertedJobs: RadarJobRow[];
  publicDtos: PublicRadarJobDTO[];
  evidenceRecords: VerificationEvidenceItem[];
  discoveredInfrastructure: DetectedHiringInfrastructure[];
  errorCode: string | null;
}

function postingToJobRow(params: {
  posting: RadarPostingInput;
  existing?: RadarJobRow;
  employerFacts?: DeterministicEmployerFacts;
  nowIso: string;
}): { row: RadarJobRow; evidence: VerificationEvidenceItem[] } {
  const { posting, existing, employerFacts, nowIso } = params;
  const dedup = computeDedupIdentity(posting);
  const destination = classifyApplyDestination(posting.applyUrl ?? posting.url);
  const verification = evaluateOpportunityVerification({
    posting,
    applyMechanism: destination.applyMechanism,
    employerFacts,
  });

  const firstMover = computeFirstMoverMetrics({
    existingFirstDirectSeenAt: existing?.first_direct_seen_at ?? null,
    existingFirstSyndicatedSeenAt: existing?.first_syndicated_seen_at ?? null,
    newObservationOrigin: posting.discoveryOrigin,
    observedAtIso: nowIso,
  });

  const lifecycleNext = existing
    ? stepJobLifecycle(
        {
          lifecycleStatus: existing.lifecycle_status,
          missingPollStreak: existing.missing_poll_streak,
          firstMissingAt: existing.first_missing_at,
          lastSeenAt: existing.last_seen_at,
          lastConfirmedLiveAt: existing.last_confirmed_live_at,
          expiredAt: existing.expired_at,
          closureSignal: existing.closure_signal,
          validThrough: existing.valid_through,
        },
        posting.isClosed
          ? { kind: 'AUTHORITATIVE_CLOSURE', atIso: nowIso, signal: 'ATS_CLOSED_FLAG' }
          : { kind: 'OBSERVED_PRESENT', atIso: nowIso },
      ).next
    : ({
        lifecycleStatus: posting.isClosed
          ? 'EXPIRED'
          : verification.verificationStatus === 'SUSPICIOUS_QUARANTINE' ||
              verification.verificationStatus === 'SCAM_REJECTED'
            ? 'QUARANTINED'
            : 'ACTIVE',
        missingPollStreak: 0,
        firstMissingAt: null,
        lastSeenAt: nowIso,
        lastConfirmedLiveAt: nowIso,
        expiredAt: posting.isClosed ? nowIso : null,
        closureSignal: posting.isClosed ? 'ATS_CLOSED_FLAG' : 'NONE',
        validThrough: posting.validThrough ?? null,
      } satisfies CurrentJobLifecycleState);

  const row: RadarJobRow = {
    id: existing?.id ?? crypto.randomUUID(),
    employer_id: existing?.employer_id ?? null,
    recruitment_vacancy_id: existing?.recruitment_vacancy_id ?? null,
    primary_source_id: existing?.primary_source_id ?? posting.sourceId,
    canonical_fingerprint: existing?.canonical_fingerprint ?? dedup.canonicalFingerprint,
    requisition_cluster_key: dedup.requisitionClusterKey,
    canonical_url_hash: dedup.canonicalUrlHash,
    title_company_loc_hash: dedup.titleCompanyLocHash,
    description_simhash: dedup.descriptionSimhash,
    external_requisition_id: posting.externalRequisitionId ?? existing?.external_requisition_id ?? null,
    title: posting.title,
    normalized_title: dedup.normalizedTitle,
    company_name: posting.companyName,
    department: posting.department ?? null,
    career_category: existing?.career_category ?? null,
    seniority_level: posting.seniorityLevel ?? null,
    employment_type: posting.employmentType ?? null,
    workplace_type: posting.workplaceType,
    location_raw: posting.locationRaw,
    normalized_city: dedup.normalizedCity,
    state_region: dedup.stateRegion,
    country_code: dedup.countryCode,
    country_codes: dedup.countryCode ? [dedup.countryCode] : [],
    remote_region_restriction: posting.remoteRegionRestriction ?? null,
    visa_sponsorship: existing?.visa_sponsorship ?? null,
    salary_min: posting.salaryMin ?? null,
    salary_max: posting.salaryMax ?? null,
    salary_currency: posting.salaryCurrency ?? null,
    salary_period: posting.salaryPeriod ?? null,
    skills_required: existing?.skills_required ?? [],
    skills_preferred: existing?.skills_preferred ?? [],
    experience_years_min: existing?.experience_years_min ?? null,
    experience_years_max: existing?.experience_years_max ?? null,
    description_clean: posting.descriptionPlain,
    content_hash: dedup.contentHash,
    extraction_method: 'DETERMINISTIC',
    apply_url: posting.applyUrl ?? posting.url,
    canonical_apply_url: dedup.canonicalApplyUrl,
    apply_mechanism: destination.applyMechanism,
    auto_apply_adapter: destination.autoApplyAdapter,
    requires_human_form_review:
      destination.requiresHumanFormReview || verification.requiresHumanFormReview,
    employer_verification_status: verification.employerVerificationStatus,
    vacancy_authenticity_status: verification.vacancyAuthenticityStatus,
    verified_by_deterministic_evidence: verification.verifiedByDeterministicEvidence,
    employer_legitimacy_score: verification.employerLegitimacyScore,
    job_authenticity_score: verification.jobAuthenticityScore,
    application_safety_score: verification.applicationSafetyScore,
    composite_confidence: verification.compositeConfidence,
    verification_status: verification.verificationStatus,
    risk_flags: verification.riskFlags,
    lifecycle_status: lifecycleNext.lifecycleStatus,
    missing_poll_streak: lifecycleNext.missingPollStreak,
    first_missing_at: lifecycleNext.firstMissingAt,
    closure_signal: lifecycleNext.closureSignal,
    posted_at: posting.postedAt ?? existing?.posted_at ?? null,
    valid_through: posting.validThrough ?? existing?.valid_through ?? null,
    first_seen_at: existing?.first_seen_at ?? nowIso,
    last_seen_at: lifecycleNext.lastSeenAt,
    last_confirmed_live_at: lifecycleNext.lastConfirmedLiveAt,
    expired_at: lifecycleNext.expiredAt,
    discovery_origin: existing?.discovery_origin ?? posting.discoveryOrigin,
    first_direct_seen_at: firstMover.firstDirectSeenAt,
    first_syndicated_seen_at: firstMover.firstSyndicatedSeenAt,
    lead_time_hours: firstMover.leadTimeHours,
    exclusivity_tier: firstMover.exclusivityTier,
    attribution_text: posting.attributionText ?? existing?.attribution_text ?? null,
  };

  return { row, evidence: verification.evidence };
}

export async function pollAndCanonicalizeAtsBoard(
  input: PollAtsBoardInput,
): Promise<PollAtsBoardOutcome> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const sourceId = `${input.provider}:${input.boardToken}`;
  const targetUrl = buildAtsBoardEndpointUrl(input.provider, input.boardToken);
  const existingJobs = input.existingJobs ?? [];

  // 1) Pre-flight compliance check (Condition 1)
  const compliance = evaluateSourceCompliance({
    sourceId,
    providerKey: input.provider,
    targetUrl,
    enabled: input.enabled ?? true,
    employerSlug: input.boardToken,
    exclusionRules: input.exclusionRules,
    providerPolicies: input.providerPolicies,
    robotsSnapshot: input.robotsSnapshot,
  });

  if (!compliance.allowed) {
    const isRobots =
      compliance.blockCode === 'ROBOTS_DISALLOWED' ||
      compliance.blockCode === 'ROBOTS_TEMPORARILY_UNREACHABLE';
    return {
      runOutcome: isRobots ? 'SKIPPED_ROBOTS' : 'SKIPPED_COMPLIANCE',
      compliance,
      httpStatus: null,
      bytesFetched: 0,
      etag: input.previousEtag ?? null,
      lastModifiedHeader: input.previousLastModified ?? null,
      payloadHash: input.previousPayloadHash ?? null,
      upsertedJobs: existingJobs,
      publicDtos: existingJobs
        .filter((j) => j.lifecycle_status === 'ACTIVE')
        .map(toPublicRadarJobDTO),
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: compliance.blockCode,
    };
  }

  // 2) DNS-SSRF guarded conditional GET
  const fetched = await conditionalSafeFetch({
    url: targetUrl,
    etag: input.previousEtag,
    lastModifiedHeader: input.previousLastModified,
    previousPayloadHash: input.previousPayloadHash,
    fetchImpl: input.fetchImpl,
    lookup: input.lookup,
  });

  if (fetched.outcome === 'NOT_MODIFIED_304' || fetched.outcome === 'UNCHANGED_HASH') {
    const refreshed = existingJobs.map((job) => {
      const stepped = stepJobLifecycle(
        {
          lifecycleStatus: job.lifecycle_status,
          missingPollStreak: job.missing_poll_streak,
          firstMissingAt: job.first_missing_at,
          lastSeenAt: job.last_seen_at,
          lastConfirmedLiveAt: job.last_confirmed_live_at,
          expiredAt: job.expired_at,
          closureSignal: job.closure_signal,
          validThrough: job.valid_through,
        },
        { kind: 'SOURCE_NOT_MODIFIED', atIso: nowIso },
      );
      return {
        ...job,
        last_seen_at: stepped.next.lastSeenAt,
        last_confirmed_live_at: stepped.next.lastConfirmedLiveAt,
      };
    });

    return {
      runOutcome: fetched.outcome === 'NOT_MODIFIED_304' ? 'NOT_MODIFIED_304' : 'UNCHANGED_HASH',
      compliance,
      httpStatus: fetched.httpStatus,
      bytesFetched: fetched.bytesFetched,
      etag: fetched.etag,
      lastModifiedHeader: fetched.lastModifiedHeader,
      payloadHash: fetched.payloadHash,
      upsertedJobs: refreshed,
      publicDtos: refreshed.filter((j) => j.lifecycle_status === 'ACTIVE').map(toPublicRadarJobDTO),
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: null,
    };
  }

  if (fetched.outcome !== 'OK_MODIFIED' || fetched.bodyText === null) {
    // Condition 3: Transport/HTTP errors NEVER expire existing jobs!
    const preserved = existingJobs.map((job) => {
      stepJobLifecycle(
        {
          lifecycleStatus: job.lifecycle_status,
          missingPollStreak: job.missing_poll_streak,
          firstMissingAt: job.first_missing_at,
          lastSeenAt: job.last_seen_at,
          lastConfirmedLiveAt: job.last_confirmed_live_at,
          expiredAt: job.expired_at,
          closureSignal: job.closure_signal,
          validThrough: job.valid_through,
        },
        { kind: 'POLL_FAILED_OR_INCOMPLETE', atIso: nowIso, reason: 'HTTP_ERROR' },
      );
      return job;
    });

    const isNetOrSsrf =
      fetched.outcome === 'SSRF_OR_POLICY_BLOCKED' || fetched.outcome === 'NETWORK_ERROR';
    return {
      runOutcome: isNetOrSsrf ? 'NETWORK_OR_SSRF_BLOCKED' : 'HTTP_ERROR',
      compliance,
      httpStatus: fetched.httpStatus,
      bytesFetched: fetched.bytesFetched,
      etag: fetched.etag,
      lastModifiedHeader: fetched.lastModifiedHeader,
      payloadHash: fetched.payloadHash,
      upsertedJobs: preserved,
      publicDtos: preserved.filter((j) => j.lifecycle_status === 'ACTIVE').map(toPublicRadarJobDTO),
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: fetched.errorCode,
    };
  }

  // 3) Deterministic ATS Parse
  let postings: RadarPostingInput[];
  try {
    postings = parseAtsFeedPayload(input.provider, input.boardToken, fetched.bodyText, input.limit ?? 500);
  } catch (err) {
    return {
      runOutcome: 'PARSE_ERROR',
      compliance,
      httpStatus: fetched.httpStatus,
      bytesFetched: fetched.bytesFetched,
      etag: fetched.etag,
      lastModifiedHeader: fetched.lastModifiedHeader,
      payloadHash: fetched.payloadHash,
      upsertedJobs: existingJobs,
      publicDtos: existingJobs.filter((j) => j.lifecycle_status === 'ACTIVE').map(toPublicRadarJobDTO),
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: err instanceof Error ? err.message.slice(0, 120) : 'ATS_PARSE_ERROR',
    };
  }

  // Anomalous Empty Drop Guard (Condition 3)
  if (isAnomalousEmptyBoardDrop(input.previousItemCount, postings.length)) {
    return {
      runOutcome: 'ANOMALOUS_EMPTY_DROP',
      compliance,
      httpStatus: fetched.httpStatus,
      bytesFetched: fetched.bytesFetched,
      etag: fetched.etag,
      lastModifiedHeader: fetched.lastModifiedHeader,
      payloadHash: fetched.payloadHash,
      upsertedJobs: existingJobs,
      publicDtos: existingJobs.filter((j) => j.lifecycle_status === 'ACTIVE').map(toPublicRadarJobDTO),
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: 'ANOMALOUS_EMPTY_DROP_GUARDED',
    };
  }

  // 4) Requisition-Preserving Dedup + Verification + Lifecycle Transition
  const dedupedBatch: RadarPostingInput[] = [];
  for (const candidate of postings) {
    const alreadyInBatch = dedupedBatch.some((seen) => arePostingsSyndicationDuplicates(seen, candidate).duplicate);
    if (!alreadyInBatch) dedupedBatch.push(candidate);
  }

  const byFingerprint = new Map<string, RadarJobRow>();
  for (const existing of existingJobs) {
    byFingerprint.set(existing.canonical_fingerprint, existing);
  }

  const seenFingerprints = new Set<string>();
  const nextRows: RadarJobRow[] = [];
  const allEvidence: VerificationEvidenceItem[] = [];
  const infraMap = new Map<string, DetectedHiringInfrastructure>();

  for (const posting of dedupedBatch) {
    const id = computeDedupIdentity(posting);
    const existing = byFingerprint.get(id.canonicalFingerprint);
    const { row, evidence } = postingToJobRow({
      posting,
      existing,
      employerFacts: input.employerFacts,
      nowIso,
    });
    seenFingerprints.add(row.canonical_fingerprint);
    nextRows.push(row);
    allEvidence.push(...evidence);

    const detectedApplyInfra = detectHiringInfrastructureFromUrl(posting.applyUrl ?? posting.url);
    if (detectedApplyInfra) {
      infraMap.set(detectedApplyInfra.canonicalSourceUrl, detectedApplyInfra);
    }
  }

  // Step absence lifecycle for previously known jobs not seen in this complete snapshot
  for (const existing of existingJobs) {
    if (seenFingerprints.has(existing.canonical_fingerprint)) continue;
    const stepped = stepJobLifecycle(
      {
        lifecycleStatus: existing.lifecycle_status,
        missingPollStreak: existing.missing_poll_streak,
        firstMissingAt: existing.first_missing_at,
        lastSeenAt: existing.last_seen_at,
        lastConfirmedLiveAt: existing.last_confirmed_live_at,
        expiredAt: existing.expired_at,
        closureSignal: existing.closure_signal,
        validThrough: existing.valid_through,
      },
      {
        kind: 'ABSENT_FROM_COMPLETE_SNAPSHOT',
        atIso: nowIso,
        previousSourceItemCount: input.previousItemCount ?? existingJobs.length,
        currentSourceItemCount: dedupedBatch.length,
      },
    );
    nextRows.push({
      ...existing,
      lifecycle_status: stepped.next.lifecycleStatus,
      missing_poll_streak: stepped.next.missingPollStreak,
      first_missing_at: stepped.next.firstMissingAt,
      expired_at: stepped.next.expiredAt,
      closure_signal: stepped.next.closureSignal,
    });
  }

  const publicDtos = nextRows
    .filter(
      (j) =>
        j.lifecycle_status === 'ACTIVE' &&
        (j.verification_status === 'VERIFIED_HIGH_TRUST' ||
          j.verification_status === 'VERIFIED_STANDARD' ||
          j.verification_status === 'UNVERIFIED_EXTERNAL_FORM'),
    )
    .map(toPublicRadarJobDTO);

  return {
    runOutcome: 'OK_COMPLETE',
    compliance,
    httpStatus: fetched.httpStatus,
    bytesFetched: fetched.bytesFetched,
    etag: fetched.etag,
    lastModifiedHeader: fetched.lastModifiedHeader,
    payloadHash: fetched.payloadHash,
    upsertedJobs: nextRows,
    publicDtos,
    evidenceRecords: allEvidence,
    discoveredInfrastructure: [...infraMap.values()],
    errorCode: null,
  };
}
