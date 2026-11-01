import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LookupFn } from '@/lib/agent/ssrf';
import {
  arePostingsSyndicationDuplicates,
  canonicalizeJobUrl,
  classifyApplyDestination,
  computeDedupIdentity,
  normalizeLocationSignature,
} from '@/lib/radar/dedup/canonicalize';
import { evaluateOpportunityVerification } from '@/lib/radar/verification/evidence';
import {
  MIN_ABSENCE_WINDOW_MS,
  REQUIRED_ABSENCE_OBSERVATIONS,
  stepJobLifecycle,
  type CurrentJobLifecycleState,
} from '@/lib/radar/lifecycle/expiration';
import {
  computeFirstMoverMetrics,
  detectHiringInfrastructureFromUrl,
} from '@/lib/radar/intelligence/first-mover';
import { pollAndCanonicalizeAtsBoard } from '@/lib/radar/pipeline/ingest-batch';
import type { RadarPostingInput } from '@/lib/radar/types';
import {
  ASHBY_FIXTURE,
  BREEZY_FIXTURE,
  GEM_FIXTURE,
  GREENHOUSE_FIXTURE,
  LEVER_EU_FIXTURE,
  LEVER_US_FIXTURE,
  PERSONIO_XML_FIXTURE,
  PINPOINT_FIXTURE,
  POLYMER_FIXTURE,
  RECRUITEE_FIXTURE,
  TEAMTAILOR_RSS_FIXTURE,
  WORKABLE_DETAILS_FIXTURE,
} from './fixtures/radar/ats-payloads';

const publicLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

function basePosting(overrides: Partial<RadarPostingInput> = {}): RadarPostingInput {
  return {
    providerKey: 'greenhouse',
    sourceId: 'greenhouse:acme',
    externalId: '1001',
    companyName: 'Acme Cloud',
    employerSlugHint: 'acme',
    title: 'Senior Backend Engineer',
    url: 'https://boards.greenhouse.io/acme/jobs/1001',
    applyUrl: 'https://boards.greenhouse.io/acme/jobs/1001',
    descriptionPlain:
      'Build resilient distributed storage engines in Go, PostgreSQL, and Kubernetes for global customers.',
    locationRaw: 'London, United Kingdom',
    city: 'London',
    countryCode: 'GB',
    workplaceType: 'HYBRID',
    discoveryOrigin: 'DIRECT_ATS_API',
    ...overrides,
  };
}

describe('Condition 5: Requisition-Preserving 4-Tier Deduplication', () => {
  it('NEVER merges identical job titles advertised in different countries or cities', () => {
    const london = basePosting({
      externalId: '1001',
      url: 'https://boards.greenhouse.io/acme/jobs/1001',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/1001',
      locationRaw: 'London, United Kingdom',
      city: 'London',
      countryCode: 'GB',
    });
    const lagos = basePosting({
      externalId: '1002',
      url: 'https://boards.greenhouse.io/acme/jobs/1002',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/1002',
      locationRaw: 'Lagos, Nigeria',
      city: 'Lagos',
      countryCode: 'NG',
    });

    const idLondon = computeDedupIdentity(london);
    const idLagos = computeDedupIdentity(lagos);

    expect(idLondon.canonicalFingerprint).not.toBe(idLagos.canonicalFingerprint);
    expect(arePostingsSyndicationDuplicates(london, lagos).duplicate).toBe(false);
    // Yet both share the same multi-location campaign cluster key!
    expect(idLondon.requisitionClusterKey).toBe(idLagos.requisitionClusterKey);
  });

  it('preserves distinct city openings even on career pages without ATS IDs', () => {
    const dublinCareer = basePosting({
      discoveryOrigin: 'DIRECT_EMPLOYER_CAREER_PAGE',
      externalId: '',
      url: 'https://acme.com/careers/senior-backend-engineer?loc=dublin',
      applyUrl: 'https://acme.com/careers/senior-backend-engineer?loc=dublin',
      city: 'Dublin',
      countryCode: 'IE',
      locationRaw: 'Dublin, Ireland',
    });
    const berlinCareer = basePosting({
      discoveryOrigin: 'DIRECT_EMPLOYER_CAREER_PAGE',
      externalId: '',
      url: 'https://acme.com/careers/senior-backend-engineer?loc=berlin',
      applyUrl: 'https://acme.com/careers/senior-backend-engineer?loc=berlin',
      city: 'Berlin',
      countryCode: 'DE',
      locationRaw: 'Berlin, Germany',
    });

    expect(arePostingsSyndicationDuplicates(dublinCareer, berlinCareer).duplicate).toBe(false);
  });

  it('does NOT misread "San Jose, CA" (California) as Canada (CA)', () => {
    const loc = normalizeLocationSignature({
      locationRaw: 'San Jose, CA',
      workplaceType: 'ONSITE',
    });
    expect(loc.countryCode).toBe('US');
    expect(loc.stateRegion).toBe('ca');
    expect(loc.normalizedCity).toBe('san jose');
  });

  it('merges true syndication duplicates pointing to the same Greenhouse posting with UTM tracking', () => {
    const directGh = basePosting();
    const syndicatedCopy = basePosting({
      providerKey: 'public_feed',
      sourceId: 'public_feed:jobicy',
      externalId: 'jobicy-9988',
      discoveryOrigin: 'PUBLIC_AGGREGATOR_FEED',
      url: 'https://job-boards.greenhouse.io/acme/jobs/1001/?utm_source=jobicy&gh_src=feed99',
      applyUrl: 'https://job-boards.greenhouse.io/acme/jobs/1001/?utm_source=jobicy&gh_src=feed99',
    });

    const check = arePostingsSyndicationDuplicates(directGh, syndicatedCopy);
    expect(check.duplicate).toBe(true);
    expect(check.matchedTier).toBe(1);
    expect(canonicalizeJobUrl('https://WWW.job-boards.greenhouse.io/acme/jobs/1001/?utm_source=x&gh_jid=1001')).toBe(
      'https://boards.greenhouse.io/acme/jobs/1001?gh_jid=1001',
    );
  });
});

describe('Condition 2: Evidence-Backed Verification & Mandatory External Form Gate', () => {
  it('NEVER allows AI advisory input to certify an unverified employer or vacancy', () => {
    const unverifiedExternal = basePosting({
      discoveryOrigin: 'COMMUNITY_HIRING_THREAD',
      url: 'https://unknown-startup-xyz.io/jobs/1',
      applyUrl: 'https://unknown-startup-xyz.io/jobs/1',
    });

    const res = evaluateOpportunityVerification({
      posting: unverifiedExternal,
      applyMechanism: 'DIRECT_CAREER_PAGE',
      employerFacts: {}, // zero deterministic evidence
      aiAdvisory: {
        advisoryFlags: [],
        penaltyPoints: -50, // adversarial attempt to inject negative penalty (= positive boost!)
        rationale: 'Looks 100% legit to the model.',
      },
    });

    expect(res.verifiedByDeterministicEvidence).toBe(false);
    expect(res.employerVerificationStatus).toBe('UNVERIFIED');
    expect(res.vacancyAuthenticityStatus).toBe('UNVERIFIED');
    expect(res.verificationStatus).toBe('PENDING_VERIFICATION');
    expect(res.requiresHumanFormReview).toBe(true);
  });

  it('certifies VERIFIED_HIGH_TRUST only when backed by deterministic domain/org evidence', () => {
    const res = evaluateOpportunityVerification({
      posting: basePosting(),
      applyMechanism: 'ATS_NATIVE',
      employerFacts: {
        corporateDomain: 'acme.com',
        corporateDomainLinksToAtsBoard: true,
        domainResolvesHttps: true,
        mxRecordPresent: true,
      },
    });

    expect(res.verifiedByDeterministicEvidence).toBe(true);
    expect(res.employerVerificationStatus).toBe('EVIDENCE_VERIFIED');
    expect(res.vacancyAuthenticityStatus).toBe('DOMAIN_CORROBORATED');
    expect(res.verificationStatus).toBe('VERIFIED_HIGH_TRUST');
    expect(res.evidence.every((e) => e.isDeterministic)).toBe(true);
  });

  it('rejects upfront fee scams, sensitive ID phishing, and brand impersonation on external forms', () => {
    const feeScam = evaluateOpportunityVerification({
      posting: basePosting({
        companyName: 'Google',
        url: 'https://docs.google.com/forms/d/e/1FAIpQLScam/viewform',
        applyUrl: 'https://docs.google.com/forms/d/e/1FAIpQLScam/viewform',
        descriptionPlain:
          'Contact hr.google.recruiting@gmail.com and pay a refundable onboarding fee of $50. Submit your BVN and passport scan.',
      }),
      applyMechanism: 'GOOGLE_FORM',
    });

    expect(feeScam.verificationStatus).toBe('SCAM_REJECTED');
    expect(feeScam.employerVerificationStatus).toBe('IMPERSONATION_QUARANTINED');
    expect(feeScam.vacancyAuthenticityStatus).toBe('SCAM_REJECTED');
    expect(feeScam.applicationSafetyScore).toBe(0);
    expect(feeScam.riskFlags).toContain('BRAND_IMPERSONATION_SUSPECTED');
    expect(feeScam.riskFlags).toContain('UPFRONT_APPLICATION_FEE');
    expect(feeScam.riskFlags).toContain('SENSITIVE_GOVERNMENT_ID_ON_APPLY');
  });

  it('enforces requiresHumanFormReview=true and autoApplyAdapter=null on every external form provider', () => {
    for (const url of [
      'https://docs.google.com/forms/d/e/1FAIpQLSeTest/viewform',
      'https://tally.so/r/mV99xZ',
      'https://acme.typeform.com/to/abc123',
      'https://form.jotform.com/261001234',
      'https://forms.office.com/r/xyz987',
      'https://airtable.com/app123/shr456',
      'mailto:careers@acme.com',
    ]) {
      const dest = classifyApplyDestination(url);
      expect(dest.requiresHumanFormReview).toBe(true);
      expect(dest.autoApplyAdapter).toBeNull();
    }
  });
});

describe('Condition 3: Multi-Observation Vacancy Expiration State Machine', () => {
  const initialActive: CurrentJobLifecycleState = {
    lifecycleStatus: 'ACTIVE',
    missingPollStreak: 0,
    firstMissingAt: null,
    lastSeenAt: '2026-10-29T00:00:00.000Z',
    lastConfirmedLiveAt: '2026-10-29T00:00:00.000Z',
    expiredAt: null,
    closureSignal: 'NONE',
  };

  it('NEVER expires or increments streak on HTTP/network poll failures or anomalous empty drops', () => {
    const afterFailure = stepJobLifecycle(initialActive, {
      kind: 'POLL_FAILED_OR_INCOMPLETE',
      atIso: '2026-10-29T06:00:00.000Z',
      reason: 'HTTP_ERROR',
    });
    expect(afterFailure.next.lifecycleStatus).toBe('ACTIVE');
    expect(afterFailure.next.missingPollStreak).toBe(0);

    const afterEmptyDrop = stepJobLifecycle(initialActive, {
      kind: 'ABSENT_FROM_COMPLETE_SNAPSHOT',
      atIso: '2026-10-29T06:00:00.000Z',
      previousSourceItemCount: 42,
      currentSourceItemCount: 0,
    });
    expect(afterEmptyDrop.anomalousDropProtected).toBe(true);
    expect(afterEmptyDrop.next.lifecycleStatus).toBe('ACTIVE');
    expect(afterEmptyDrop.next.missingPollStreak).toBe(0);
  });

  it('requires 3 complete absence observations spanning >= 24 hours before marking EXPIRED', () => {
    const t1 = '2026-10-30T00:00:00.000Z';
    const s1 = stepJobLifecycle(initialActive, {
      kind: 'ABSENT_FROM_COMPLETE_SNAPSHOT',
      atIso: t1,
      previousSourceItemCount: 10,
      currentSourceItemCount: 9,
    }).next;
    expect(s1.lifecycleStatus).toBe('POTENTIALLY_CLOSING');
    expect(s1.missingPollStreak).toBe(1);

    const s2 = stepJobLifecycle(s1, {
      kind: 'ABSENT_FROM_COMPLETE_SNAPSHOT',
      atIso: new Date(new Date(t1).getTime() + 6 * 3600_000).toISOString(),
      previousSourceItemCount: 9,
      currentSourceItemCount: 9,
    }).next;
    expect(s2.lifecycleStatus).toBe('POTENTIALLY_CLOSING');
    expect(s2.missingPollStreak).toBe(2);

    // 3rd observation BEFORE 24h window -> still POTENTIALLY_CLOSING!
    const s3Early = stepJobLifecycle(s2, {
      kind: 'ABSENT_FROM_COMPLETE_SNAPSHOT',
      atIso: new Date(new Date(t1).getTime() + 12 * 3600_000).toISOString(),
      previousSourceItemCount: 9,
      currentSourceItemCount: 9,
    }).next;
    expect(s3Early.missingPollStreak).toBe(REQUIRED_ABSENCE_OBSERVATIONS);
    expect(s3Early.lifecycleStatus).toBe('POTENTIALLY_CLOSING');

    // Observation after >= 24h window -> EXPIRED
    const s4Confirmed = stepJobLifecycle(s2, {
      kind: 'ABSENT_FROM_COMPLETE_SNAPSHOT',
      atIso: new Date(new Date(t1).getTime() + MIN_ABSENCE_WINDOW_MS + 60_000).toISOString(),
      previousSourceItemCount: 9,
      currentSourceItemCount: 9,
    }).next;
    expect(s4Confirmed.lifecycleStatus).toBe('EXPIRED');
    expect(s4Confirmed.closureSignal).toBe('MULTI_POLL_ABSENCE_CONFIRMED');

    // Re-appearing resets back to ACTIVE cleanly
    const recovered = stepJobLifecycle(s2, {
      kind: 'OBSERVED_PRESENT',
      atIso: '2026-10-30T15:00:00.000Z',
    }).next;
    expect(recovered.lifecycleStatus).toBe('ACTIVE');
    expect(recovered.missingPollStreak).toBe(0);
  });

  it('expires immediately on authoritative 404/410 or closed-form signal', () => {
    const closed = stepJobLifecycle(initialActive, {
      kind: 'AUTHORITATIVE_CLOSURE',
      atIso: '2026-10-30T02:00:00.000Z',
      signal: 'AUTHORITATIVE_HTTP_404_410',
    }).next;
    expect(closed.lifecycleStatus).toBe('EXPIRED');
    expect(closed.closureSignal).toBe('AUTHORITATIVE_HTTP_404_410');
  });
});

describe('Condition 4: Migration Security Locks & Public DTO Boundary', () => {
  it('enforces RLS + explicit REVOKE ALL FROM anon, authenticated on every Radar table & RPC in 053..055', () => {
    const sql = [
      readFileSync('supabase/migrations/053_radar_core_employers_and_sources.sql', 'utf8'),
      readFileSync('supabase/migrations/054_radar_jobs_forms_evidence_and_dedup.sql', 'utf8'),
      readFileSync('supabase/migrations/055_radar_embeddings_runs_and_rpcs.sql', 'utf8'),
    ].join('\n');

    const radarTables = [
      'radar_provider_policies',
      'radar_employers',
      'radar_exclusions',
      'radar_jobs',
      'radar_job_sources',
      'radar_verification_evidence',
      'radar_application_forms',
      'radar_job_embeddings',
      'radar_source_candidates',
      'radar_crawl_runs',
    ];

    for (const table of radarTables) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated;`);
    }
    expect(sql).toContain('vector(384)');
    expect(sql).not.toContain('vector(1536)');
  });
});

describe('Phase 2: All 11 Authorized Public ATS Providers + First-Mover Intelligence', () => {
  it.each([
    ['greenhouse', 'stripe', GREENHOUSE_FIXTURE, 'application/json', 2],
    ['lever', 'spotify', LEVER_US_FIXTURE, 'application/json', 1],
    ['lever_eu', 'klarna-eu', LEVER_EU_FIXTURE, 'application/json', 1],
    ['ashby', 'linear', ASHBY_FIXTURE, 'application/json', 1],
    ['workable', 'paystack-partner', WORKABLE_DETAILS_FIXTURE, 'application/json', 1],
    ['recruitee', 'nordcloudlabs', RECRUITEE_FIXTURE, 'application/json', 1],
    ['personio', 'celonis', PERSONIO_XML_FIXTURE, 'application/xml', 1],
    ['pinpoint', 'healthtech', PINPOINT_FIXTURE, 'application/json', 1],
    ['gem', 'cohere-demo', GEM_FIXTURE, 'application/json', 1],
    ['polymer', 'acme-ai', POLYMER_FIXTURE, 'application/json', 1],
    ['breezy', 'payfintech', BREEZY_FIXTURE, 'application/json', 1],
    ['teamtailor', 'sanalabs', TEAMTAILOR_RSS_FIXTURE, 'application/rss+xml', 1],
  ] as const)(
    'ingests and canonicalizes %s (%s) deterministically with zero fabricated fields',
    async (provider, slug, fixtureBody, contentType, expectedCount) => {
      const outcome = await pollAndCanonicalizeAtsBoard({
        provider,
        boardToken: slug,
        nowIso: '2026-11-01T08:00:00.000Z',
        employerFacts: {
          corporateDomain: `${slug}.example.com`,
          corporateDomainLinksToAtsBoard: true,
          domainResolvesHttps: true,
        },
        lookup: publicLookup,
        fetchImpl: async () =>
          new Response(fixtureBody, {
            status: 200,
            headers: { 'content-type': contentType, etag: `"etag-${provider}"` },
          }),
      });

      expect(outcome.runOutcome).toBe('OK_COMPLETE');
      expect(outcome.upsertedJobs).toHaveLength(expectedCount);
      expect(outcome.publicDtos).toHaveLength(expectedCount);

      // Condition 4 check: public DTO exposes zero internal hashes or crawler fields
      for (const dto of outcome.publicDtos) {
        expect(dto).not.toHaveProperty('canonical_fingerprint');
        expect(dto).not.toHaveProperty('content_hash');
        expect(dto).not.toHaveProperty('missing_poll_streak');
        expect(dto.description.length).toBeGreaterThan(10);
      }

      if (provider === 'greenhouse') {
        // Dublin (EUR salary) and Bengaluru (null salary - never invented!) stay SEPARATE!
        const dublin = outcome.upsertedJobs.find((j) => j.location_raw?.includes('Dublin'))!;
        const blr = outcome.upsertedJobs.find((j) => j.location_raw?.includes('Bengaluru'))!;
        expect(dublin.salary_min).toBe(145000);
        expect(dublin.salary_currency).toBe('EUR');
        expect(blr.salary_min).toBeNull();
        expect(blr.salary_currency).toBeNull();
      }

      if (provider === 'ashby') {
        // Ashby `isRemote: true` + `workplaceType: 'Hybrid'` MUST classify as HYBRID, not REMOTE!
        expect(outcome.upsertedJobs[0].workplace_type).toBe('HYBRID');
        expect(outcome.upsertedJobs[0].salary_min).toBe(180000);
        expect(outcome.upsertedJobs[0].auto_apply_adapter).toBe('ashby');
      }

      if (provider === 'recruitee') {
        expect(outcome.upsertedJobs[0].posted_at).toBe('2026-10-15T09:30:00.000Z');
      }
    },
  );

  it('tracks First-Mover lead time and detects outbound ATS/Form hiring infrastructure', () => {
    const fm1 = computeFirstMoverMetrics({
      newObservationOrigin: 'DIRECT_ATS_API',
      observedAtIso: '2026-11-01T00:00:00.000Z',
    });
    expect(fm1.exclusivityTier).toBe('FIRST_MOVER_EXCLUSIVE');

    const fm2 = computeFirstMoverMetrics({
      existingFirstDirectSeenAt: fm1.firstDirectSeenAt,
      newObservationOrigin: 'PUBLIC_AGGREGATOR_FEED',
      observedAtIso: '2026-11-01T18:30:00.000Z',
    });
    expect(fm2.exclusivityTier).toBe('EARLY_DIRECT');
    expect(fm2.leadTimeHours).toBe(18.5);

    expect(detectHiringInfrastructureFromUrl('https://jobs.ashbyhq.com/linear/abc')?.sourceRegistryId).toBe(
      'ashby:linear',
    );
    expect(
      detectHiringInfrastructureFromUrl('https://docs.google.com/forms/d/e/1FAIpQLSeAbc/viewform')?.kind,
    ).toBe('EXTERNAL_APPLICATION_FORM');
  });
});
