/**
 * Phase 4 - Direct Corporate Career Page Poller (`jsonld_career`)
 * ===============================================================
 * Orchestrates compliant direct career-page discovery & canonicalization:
 *   1. Condition 1: Fetches & caches origin `/robots.txt`, evaluates RFC 9309 +
 *      `Crawl-delay` + `Content-Signal: search=no` + provider policy + exclusions.
 *   2. Condition 4 / SSRF: Fetches page via DNS-pinned `conditionalSafeFetch`.
 *   3. Deterministic Pass First: Extracts `schema.org/JobPosting` JSON-LD and
 *      outbound ATS/Form links (`extractCareerPageIntelligence`), honoring page
 *      `X-Robots-Tag` and `<meta name="robots" content="noindex">`.
 *   4. Bounded AI Fallback: Only when 0 deterministic JSON-LD postings exist and
 *      the page contains clear hiring text, invokes `extractCareerPageWithAiFallback`
 *      (`wrapUntrusted` + `null` for unknown fields + Condition 2 AI-never-positive).
 *   5. Condition 5, Condition 2, Condition 3: Requisition-preserving dedup,
 *      deterministic domain corroboration, and multi-poll expiration protection.
 */

import crypto from 'node:crypto';
import type { AIGateway } from '@packages/ai/gateway';
import type { LookupFn } from '@/lib/agent/ssrf';
import { extractCareerPageIntelligence } from '@/lib/radar/adapters/jsonld';
import { evaluateSourceCompliance } from '@/lib/radar/compliance/policy';
import { classifyApplyDestination, computeDedupIdentity } from '@/lib/radar/dedup/canonicalize';
import { extractCareerPageWithAiFallback } from '@/lib/radar/extraction/ai-extractor';
import { conditionalSafeFetch } from '@/lib/radar/http/fetcher';
import { computeFirstMoverMetrics } from '@/lib/radar/intelligence/first-mover';
import {
  isAnomalousEmptyBoardDrop,
  stepJobLifecycle,
  type CurrentJobLifecycleState,
} from '@/lib/radar/lifecycle/expiration';
import type { PollAtsBoardOutcome } from '@/lib/radar/pipeline/ingest-batch';
import {
  toPublicRadarJobDTO,
  type ExclusionRule,
  type ProviderPolicy,
  type RadarJobRow,
  type RadarPostingInput,
} from '@/lib/radar/types';
import {
  evaluateOpportunityVerification,
  type AIAdvisorySignal,
  type DeterministicEmployerFacts,
  type VerificationEvidenceItem,
} from '@/lib/radar/verification/evidence';

export interface PollCareerPageInput {
  sourceId: string;
  careerPageUrl: string;
  companyName: string;
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
  allowAiFallback?: boolean;
  aiGateway?: Pick<AIGateway, 'run'>;
  nowIso?: string;
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
}

function buildCareerJobRow(params: {
  posting: RadarPostingInput;
  existing?: RadarJobRow;
  employerFacts?: DeterministicEmployerFacts;
  aiAdvisory?: AIAdvisorySignal | null;
  nowIso: string;
}): { row: RadarJobRow; evidence: VerificationEvidenceItem[] } {
  const { posting, existing, employerFacts, aiAdvisory, nowIso } = params;
  const dedup = computeDedupIdentity(posting);
  const dest = classifyApplyDestination(posting.applyUrl ?? posting.url);
  const verification = evaluateOpportunityVerification({
    posting,
    applyMechanism: dest.applyMechanism,
    employerFacts,
    aiAdvisory: aiAdvisory ?? undefined,
  });

  const firstMover = computeFirstMoverMetrics({
    existingFirstDirectSeenAt: existing?.first_direct_seen_at ?? null,
    existingFirstSyndicatedSeenAt: existing?.first_syndicated_seen_at ?? null,
    newObservationOrigin: posting.discoveryOrigin,
    observedAtIso: nowIso,
  });

  const lifecycleNext: CurrentJobLifecycleState = existing
    ? stepJobLifecycle(
        {
          lifecycleStatus: existing.lifecycle_status,
          missingPollStreak: existing.missing_poll_streak,
          firstMissingAt: existing.first_missing_at,
          lastSeenAt: existing.last_seen_at,
          lastConfirmedLiveAt: existing.last_confirmed_live_at,
          expiredAt: existing.expired_at,
          closureSignal: existing.closure_signal,
          validThrough: posting.validThrough ?? existing.valid_through ?? null,
        },
        posting.isClosed
          ? { kind: 'AUTHORITATIVE_CLOSURE', atIso: nowIso, signal: 'ATS_CLOSED_FLAG' }
          : { kind: 'OBSERVED_PRESENT', atIso: nowIso },
      ).next
    : {
        lifecycleStatus: posting.isClosed ? 'EXPIRED' : 'ACTIVE',
        missingPollStreak: 0,
        firstMissingAt: null,
        lastSeenAt: nowIso,
        lastConfirmedLiveAt: nowIso,
        expiredAt: posting.isClosed ? nowIso : null,
        closureSignal: posting.isClosed ? 'ATS_CLOSED_FLAG' : 'NONE',
        validThrough: posting.validThrough ?? null,
      };

  const row: RadarJobRow = {
    id: existing?.id ?? crypto.randomUUID(),
    employer_id: existing?.employer_id ?? null,
    recruitment_vacancy_id: null,
    primary_source_id: posting.sourceId,
    canonical_fingerprint: dedup.canonicalFingerprint,
    requisition_cluster_key: dedup.requisitionClusterKey,
    canonical_url_hash: dedup.canonicalUrlHash,
    title_company_loc_hash: dedup.titleCompanyLocHash,
    description_simhash: dedup.descriptionSimhash,
    external_requisition_id: posting.externalRequisitionId ?? posting.externalId,
    title: posting.title.trim(),
    normalized_title: dedup.normalizedTitle,
    company_name: posting.companyName.trim(),
    department: posting.department ?? null,
    career_category: existing?.career_category ?? null,
    seniority_level: posting.seniorityLevel ?? null,
    employment_type: posting.employmentType ?? null,
    workplace_type: posting.workplaceType,
    location_raw: posting.locationRaw ?? null,
    normalized_city: dedup.normalizedCity || null,
    state_region: dedup.stateRegion || null,
    country_code: dedup.countryCode,
    country_codes: dedup.countryCode ? [dedup.countryCode] : [],
    remote_region_restriction: posting.remoteRegionRestriction ?? null,
    visa_sponsorship: posting.visaSponsorship ?? existing?.visa_sponsorship ?? null,
    salary_min: posting.salaryMin ?? null,
    salary_max: posting.salaryMax ?? null,
    salary_currency: posting.salaryCurrency ?? null,
    salary_period: posting.salaryPeriod ?? null,
    skills_required: posting.skillsRequired ?? existing?.skills_required ?? [],
    skills_preferred: posting.skillsPreferred ?? existing?.skills_preferred ?? [],
    experience_years_min: posting.experienceYearsMin ?? existing?.experience_years_min ?? null,
    experience_years_max: posting.experienceYearsMax ?? existing?.experience_years_max ?? null,
    description_clean: posting.descriptionPlain,
    content_hash: dedup.contentHash,
    extraction_method: posting.extractionMethod ?? 'DETERMINISTIC',
    apply_url: posting.applyUrl ?? posting.url,
    canonical_apply_url: dedup.canonicalApplyUrl,
    apply_mechanism: dest.applyMechanism,
    auto_apply_adapter: dest.autoApplyAdapter,
    requires_human_form_review:
      dest.requiresHumanFormReview || verification.requiresHumanFormReview,
    employer_verification_status: verification.employerVerificationStatus,
    vacancy_authenticity_status: verification.vacancyAuthenticityStatus,
    verified_by_deterministic_evidence: verification.verifiedByDeterministicEvidence,
    employer_legitimacy_score: verification.employerLegitimacyScore,
    job_authenticity_score: verification.jobAuthenticityScore,
    application_safety_score: verification.applicationSafetyScore,
    composite_confidence: verification.compositeConfidence,
    verification_status: verification.verificationStatus,
    risk_flags: verification.riskFlags,
    lifecycle_status:
      verification.verificationStatus === 'SCAM_REJECTED' ||
      verification.verificationStatus === 'SUSPICIOUS_QUARANTINE'
        ? 'QUARANTINED'
        : lifecycleNext.lifecycleStatus,
    missing_poll_streak: lifecycleNext.missingPollStreak,
    first_missing_at: lifecycleNext.firstMissingAt,
    closure_signal: lifecycleNext.closureSignal,
    posted_at: posting.postedAt ?? existing?.posted_at ?? null,
    valid_through: posting.validThrough ?? existing?.valid_through ?? null,
    first_seen_at: existing?.first_seen_at ?? nowIso,
    last_seen_at: lifecycleNext.lastSeenAt,
    last_confirmed_live_at: lifecycleNext.lastConfirmedLiveAt,
    expired_at: lifecycleNext.expiredAt,
    discovery_origin: posting.discoveryOrigin,
    first_direct_seen_at: firstMover.firstDirectSeenAt,
    first_syndicated_seen_at: firstMover.firstSyndicatedSeenAt,
    lead_time_hours: firstMover.leadTimeHours,
    exclusivity_tier: firstMover.exclusivityTier,
    attribution_text: posting.attributionText ?? null,
  };

  return { row, evidence: verification.evidence };
}

export async function pollAndCanonicalizeCareerPage(
  input: PollCareerPageInput,
): Promise<PollAtsBoardOutcome> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const existingJobs = input.existingJobs ?? [];

  // 1. Fetch origin /robots.txt if not already supplied (Condition 1 mandatory for jsonld_career)
  let robotsSnapshot = input.robotsSnapshot ?? null;
  if (!robotsSnapshot) {
    try {
      const origin = new URL(input.careerPageUrl).origin;
      const robRes = await conditionalSafeFetch({
        url: `${origin}/robots.txt`,
        fetchImpl: input.fetchImpl,
        lookup: input.lookup,
        maxBytes: 256 * 1024,
        timeoutMs: 8000,
      });
      robotsSnapshot = {
        httpStatus: robRes.httpStatus,
        bodyText: robRes.bodyText ?? '',
      };
    } catch {
      robotsSnapshot = { httpStatus: null, bodyText: '' };
    }
  }

  const compliance = evaluateSourceCompliance({
    sourceId: input.sourceId,
    providerKey: 'jsonld_career',
    targetUrl: input.careerPageUrl,
    enabled: input.enabled ?? true,
    exclusionRules: input.exclusionRules,
    providerPolicies: input.providerPolicies,
    robotsSnapshot,
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
      publicDtos: existingJobs.filter((j) => j.lifecycle_status === 'ACTIVE').map(toPublicRadarJobDTO),
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: compliance.blockCode,
    };
  }

  // 2. DNS-pinned conditional HTTP fetch
  const fetched = await conditionalSafeFetch({
    url: input.careerPageUrl,
    etag: input.previousEtag,
    lastModifiedHeader: input.previousLastModified,
    previousPayloadHash: input.previousPayloadHash,
    fetchImpl: input.fetchImpl,
    lookup: input.lookup,
  });

  if (fetched.outcome === 'NOT_MODIFIED_304' || fetched.outcome === 'UNCHANGED_HASH') {
    return {
      runOutcome: fetched.outcome === 'NOT_MODIFIED_304' ? 'NOT_MODIFIED_304' : 'UNCHANGED_HASH',
      compliance,
      httpStatus: fetched.httpStatus,
      bytesFetched: fetched.bytesFetched,
      etag: fetched.etag,
      lastModifiedHeader: fetched.lastModifiedHeader,
      payloadHash: fetched.payloadHash,
      upsertedJobs: [],
      publicDtos: [],
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: null,
    };
  }

  if (fetched.outcome !== 'OK_MODIFIED' || fetched.bodyText === null) {
    const isAuthoritativeGone =
      fetched.outcome === 'AUTHORITATIVE_NOT_FOUND' ||
      fetched.httpStatus === 404 ||
      fetched.httpStatus === 410;
    const updatedExisting = isAuthoritativeGone
      ? existingJobs.map((prev) => {
          const next = stepJobLifecycle(
            {
              lifecycleStatus: prev.lifecycle_status,
              missingPollStreak: prev.missing_poll_streak,
              firstMissingAt: prev.first_missing_at,
              lastSeenAt: prev.last_seen_at,
              lastConfirmedLiveAt: prev.last_confirmed_live_at,
              expiredAt: prev.expired_at,
              closureSignal: prev.closure_signal,
              validThrough: prev.valid_through,
            },
            {
              kind: 'AUTHORITATIVE_CLOSURE',
              atIso: nowIso,
              signal: 'AUTHORITATIVE_HTTP_404_410',
            },
          ).next;
          return {
            ...prev,
            lifecycle_status: next.lifecycleStatus,
            closure_signal: next.closureSignal,
            expired_at: next.expiredAt,
          };
        })
      : [];

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
      upsertedJobs: updatedExisting,
      publicDtos: [],
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: fetched.errorCode,
    };
  }

  // 3. Deterministic JSON-LD & outbound hiring graph extraction first
  const jsonLd = extractCareerPageIntelligence({
    pageUrl: input.careerPageUrl,
    sourceId: input.sourceId,
    companyFallback: input.companyName,
    html: fetched.bodyText,
    xRobotsTagHeader: fetched.xRobotsTag,
  });

  if (jsonLd.indexingBlocked) {
    return {
      runOutcome: 'SKIPPED_ROBOTS',
      compliance,
      httpStatus: fetched.httpStatus,
      bytesFetched: fetched.bytesFetched,
      etag: fetched.etag,
      lastModifiedHeader: fetched.lastModifiedHeader,
      payloadHash: fetched.payloadHash,
      upsertedJobs: [],
      publicDtos: [],
      evidenceRecords: [],
      discoveredInfrastructure: [],
      errorCode: 'PAGE_NOINDEX_DIRECTIVE',
    };
  }

  let postings = jsonLd.postings;
  let aiAdvisory: AIAdvisorySignal | null = null;

  // 4. Bounded AI-Assisted fallback ONLY when deterministic JSON-LD found 0 postings
  if (postings.length === 0 && (input.allowAiFallback ?? true)) {
    const aiOut = await extractCareerPageWithAiFallback({
      pageUrl: input.careerPageUrl,
      sourceId: input.sourceId,
      companyFallback: input.companyName,
      html: fetched.bodyText,
      gateway: input.aiGateway,
    });
    postings = aiOut.postings;
    aiAdvisory = aiOut.aiAdvisory;
  }

  if (isAnomalousEmptyBoardDrop(input.previousItemCount ?? existingJobs.length, postings.length)) {
    return {
      runOutcome: 'ANOMALOUS_EMPTY_DROP',
      compliance,
      httpStatus: fetched.httpStatus,
      bytesFetched: fetched.bytesFetched,
      etag: fetched.etag,
      lastModifiedHeader: fetched.lastModifiedHeader,
      payloadHash: fetched.payloadHash,
      upsertedJobs: existingJobs,
      publicDtos: [],
      evidenceRecords: [],
      discoveredInfrastructure: jsonLd.discoveredInfrastructure,
      errorCode: 'ANOMALOUS_EMPTY_DROP',
    };
  }

  const existingByFp = new Map<string, RadarJobRow>();
  for (const job of existingJobs) {
    existingByFp.set(job.canonical_fingerprint, job);
  }

  const seenFps = new Set<string>();
  const upsertedJobs: RadarJobRow[] = [];
  const allEvidence: VerificationEvidenceItem[] = [];

  for (const posting of postings) {
    const fp = computeDedupIdentity(posting).canonicalFingerprint;
    if (seenFps.has(fp)) continue;
    seenFps.add(fp);

    const { row, evidence } = buildCareerJobRow({
      posting,
      existing: existingByFp.get(fp),
      employerFacts: input.employerFacts,
      aiAdvisory,
      nowIso,
    });
    upsertedJobs.push(row);
    allEvidence.push(...evidence);
  }

  // Multi-observation absence tracking for previously active jobs on this career page
  for (const prev of existingJobs) {
    if (seenFps.has(prev.canonical_fingerprint)) continue;
    const isExpiredByJsonLd = Boolean(
      prev.external_requisition_id &&
        jsonLd.expiredExternalIds.includes(prev.external_requisition_id),
    );
    const next = stepJobLifecycle(
      {
        lifecycleStatus: prev.lifecycle_status,
        missingPollStreak: prev.missing_poll_streak,
        firstMissingAt: prev.first_missing_at,
        lastSeenAt: prev.last_seen_at,
        lastConfirmedLiveAt: prev.last_confirmed_live_at,
        expiredAt: prev.expired_at,
        closureSignal: prev.closure_signal,
        validThrough: prev.valid_through,
      },
      isExpiredByJsonLd
        ? {
            kind: 'AUTHORITATIVE_CLOSURE',
            atIso: nowIso,
            signal: 'VALID_THROUGH_PASSED',
          }
        : {
            kind: 'ABSENT_FROM_COMPLETE_SNAPSHOT',
            atIso: nowIso,
            previousSourceItemCount: input.previousItemCount ?? existingJobs.length,
            currentSourceItemCount: postings.length,
          },
    ).next;
    upsertedJobs.push({
      ...prev,
      lifecycle_status: next.lifecycleStatus,
      missing_poll_streak: next.missingPollStreak,
      first_missing_at: next.firstMissingAt,
      expired_at: next.expiredAt,
      closure_signal: next.closureSignal,
    });
  }

  const publicDtos = upsertedJobs
    .filter(
      (j) =>
        j.lifecycle_status === 'ACTIVE' &&
        j.verification_status !== 'SCAM_REJECTED' &&
        j.verification_status !== 'SUSPICIOUS_QUARANTINE' &&
        j.verification_status !== 'TAKEDOWN',
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
    upsertedJobs,
    publicDtos,
    evidenceRecords: allEvidence,
    discoveredInfrastructure: jsonLd.discoveredInfrastructure,
    errorCode: null,
  };
}
