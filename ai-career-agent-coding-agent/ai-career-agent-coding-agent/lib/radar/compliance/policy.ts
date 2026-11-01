import type { CollectionPermission, ExclusionRule, ProviderPolicy } from '../types';
import { evaluateRobotsHttpResponse, type RobotsDecision } from './robots';

/**
 * Provider Legal/Terms Authorization & Opt-Out Compliance Gate (Condition 1)
 *
 * Principle:
 * Publicly reachable endpoints and permissive `robots.txt` files do NOT automatically
 * authorize commercial indexing. Every source must satisfy ALL FOUR checks before
 * any polling request is dispatched:
 *   1. Not matched by `radar_exclusions` (domain, URL prefix, employer slug, or ATS board).
 *   2. Source `enabled === true` and `commercialIndexingAllowed === true`.
 *   3. Provider policy exists, is NOT `PROHIBITED` or `RESTRICTED_PENDING_REVIEW`,
 *      and `providerPolicy.commercialIndexingAllowed === true`.
 *   4. RFC 9309 `robots.txt` allows the target URL when `requiresRobotsCheck === true`.
 */

export const DEFAULT_PROVIDER_POLICIES: Readonly<Record<string, ProviderPolicy>> = Object.freeze({
  first_party: {
    providerKey: 'first_party',
    displayName: 'Jobiest Employer Portal',
    collectionPermission: 'FIRST_PARTY_EMPLOYER_POSTED',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: false,
    requiresAttribution: false,
    attributionTemplate: 'Posted directly by verified employer on Jobiest',
    termsUrl: 'https://jobiest.com/terms',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 120,
    defaultPollIntervalMinutes: 60,
  },
  greenhouse: {
    providerKey: 'greenhouse',
    displayName: 'Greenhouse Public Job Board API',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Greenhouse board',
    termsUrl: 'https://www.greenhouse.com/legal',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 60,
    defaultPollIntervalMinutes: 120,
  },
  lever: {
    providerKey: 'lever',
    displayName: 'Lever Postings API (US)',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Lever board',
    termsUrl: 'https://www.lever.co/legal/',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 60,
    defaultPollIntervalMinutes: 120,
  },
  lever_eu: {
    providerKey: 'lever_eu',
    displayName: 'Lever Postings API (EU)',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Lever EU board',
    termsUrl: 'https://www.lever.co/legal/',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 60,
    defaultPollIntervalMinutes: 120,
  },
  ashby: {
    providerKey: 'ashby',
    displayName: 'Ashby Public Posting API',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Ashby board',
    termsUrl: 'https://www.ashbyhq.com/legal',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 60,
    defaultPollIntervalMinutes: 120,
  },
  workable: {
    providerKey: 'workable',
    displayName: 'Workable Public Widget API',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Workable board',
    termsUrl: 'https://www.workable.com/terms',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 40,
    defaultPollIntervalMinutes: 240,
  },
  recruitee: {
    providerKey: 'recruitee',
    displayName: 'Recruitee Public Offers API',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Recruitee career site',
    termsUrl: 'https://recruitee.com/terms',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 40,
    defaultPollIntervalMinutes: 240,
  },
  personio: {
    providerKey: 'personio',
    displayName: 'Personio Public XML Job Feed',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Personio XML feed',
    termsUrl: 'https://www.personio.com/legal-notice/',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 30,
    defaultPollIntervalMinutes: 360,
  },
  pinpoint: {
    providerKey: 'pinpoint',
    displayName: 'Pinpoint Public Postings Feed',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Pinpoint board',
    termsUrl: 'https://www.pinpointhq.com/legal/',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 30,
    defaultPollIntervalMinutes: 240,
  },
  gem: {
    providerKey: 'gem',
    displayName: 'Gem Public Job Board API',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Gem board',
    termsUrl: 'https://www.gem.com/terms',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 30,
    defaultPollIntervalMinutes: 240,
  },
  polymer: {
    providerKey: 'polymer',
    displayName: 'Polymer Public Organization Jobs API',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Polymer board',
    termsUrl: 'https://www.polymer.co/terms',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 30,
    defaultPollIntervalMinutes: 360,
  },
  breezy: {
    providerKey: 'breezy',
    displayName: 'BreezyHR Public Board JSON',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public BreezyHR board',
    termsUrl: 'https://breezy.hr/terms',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 30,
    defaultPollIntervalMinutes: 360,
  },
  teamtailor: {
    providerKey: 'teamtailor',
    displayName: 'Teamtailor Public Feed',
    collectionPermission: 'EXPLICIT_PUBLIC_EMBED_API',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from the employer public Teamtailor career portal',
    termsUrl: 'https://www.teamtailor.com/en/terms/',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 30,
    defaultPollIntervalMinutes: 360,
  },
  jsonld_career: {
    providerKey: 'jsonld_career',
    displayName: 'Employer Direct Career Page (JobPosting JSON-LD)',
    collectionPermission: 'EMPLOYER_OWNED_CAREER_PAGE_PUBLIC',
    commercialIndexingAllowed: true,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data published on the employer official career website',
    termsUrl: null,
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 12,
    defaultPollIntervalMinutes: 360,
  },
  smartrecruiters: {
    providerKey: 'smartrecruiters',
    displayName: 'SmartRecruiters Postings API',
    collectionPermission: 'RESTRICTED_PENDING_REVIEW',
    commercialIndexingAllowed: false,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: 'Listing data from SmartRecruiters',
    termsUrl: 'https://www.smartrecruiters.com/legal/',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 20,
    defaultPollIntervalMinutes: 360,
  },
  remotive_api: {
    providerKey: 'remotive_api',
    displayName: 'Remotive API',
    collectionPermission: 'PROHIBITED',
    commercialIndexingAllowed: false,
    requiresRobotsCheck: true,
    requiresAttribution: true,
    attributionTemplate: null,
    termsUrl: 'https://remotive.com',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 1,
    defaultPollIntervalMinutes: 1440,
  },
  linkedin: {
    providerKey: 'linkedin',
    displayName: 'LinkedIn Jobs',
    collectionPermission: 'PROHIBITED',
    commercialIndexingAllowed: false,
    requiresRobotsCheck: true,
    requiresAttribution: false,
    attributionTemplate: null,
    termsUrl: 'https://www.linkedin.com/legal/user-agreement',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 1,
    defaultPollIntervalMinutes: 1440,
  },
  indeed: {
    providerKey: 'indeed',
    displayName: 'Indeed Jobs',
    collectionPermission: 'PROHIBITED',
    commercialIndexingAllowed: false,
    requiresRobotsCheck: true,
    requiresAttribution: false,
    attributionTemplate: null,
    termsUrl: 'https://www.indeed.com/legal',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 1,
    defaultPollIntervalMinutes: 1440,
  },
  glassdoor: {
    providerKey: 'glassdoor',
    displayName: 'Glassdoor',
    collectionPermission: 'PROHIBITED',
    commercialIndexingAllowed: false,
    requiresRobotsCheck: true,
    requiresAttribution: false,
    attributionTemplate: null,
    termsUrl: 'https://www.glassdoor.com/about/terms.htm',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 1,
    defaultPollIntervalMinutes: 1440,
  },
  wellfound: {
    providerKey: 'wellfound',
    displayName: 'Wellfound',
    collectionPermission: 'PROHIBITED',
    commercialIndexingAllowed: false,
    requiresRobotsCheck: true,
    requiresAttribution: false,
    attributionTemplate: null,
    termsUrl: 'https://wellfound.com/terms',
    termsReviewedAt: '2026-11-01T00:00:00Z',
    maxRequestsPerMinute: 1,
    defaultPollIntervalMinutes: 1440,
  },
});

export const BUILTIN_EXCLUSION_RULES: readonly ExclusionRule[] = Object.freeze([
  { patternType: 'DOMAIN', patternValue: 'linkedin.com', reason: 'TOS_RESTRICTED', active: true },
  { patternType: 'DOMAIN', patternValue: 'indeed.com', reason: 'TOS_RESTRICTED', active: true },
  { patternType: 'DOMAIN', patternValue: 'glassdoor.com', reason: 'TOS_RESTRICTED', active: true },
  { patternType: 'DOMAIN', patternValue: 'wellfound.com', reason: 'TOS_RESTRICTED', active: true },
  { patternType: 'URL_PREFIX', patternValue: 'https://remotive.com/api', reason: 'ROBOTS_DISALLOW', active: true },
]);

export type ComplianceBlockCode =
  | 'EXCLUDED_BY_TAKEDOWN_OR_OPT_OUT'
  | 'SOURCE_DISABLED'
  | 'UNKNOWN_PROVIDER_POLICY'
  | 'PROVIDER_PROHIBITED'
  | 'PROVIDER_RESTRICTED_PENDING_REVIEW'
  | 'COMMERCIAL_INDEXING_NOT_AUTHORIZED'
  | 'INVALID_TARGET_URL'
  | 'ROBOTS_DISALLOWED'
  | 'ROBOTS_TEMPORARILY_UNREACHABLE';

export interface SourceComplianceInput {
  sourceId: string;
  providerKey: string;
  targetUrl: string;
  enabled?: boolean;
  sourceCollectionPermission?: CollectionPermission;
  sourceCommercialIndexingAllowed?: boolean;
  employerSlug?: string | null;
  providerPolicies?: Record<string, ProviderPolicy>;
  exclusionRules?: readonly ExclusionRule[];
  robotsSnapshot?: {
    httpStatus: number | null;
    bodyText: string;
  } | null;
}

export interface SourceComplianceDecision {
  allowed: boolean;
  blockCode: ComplianceBlockCode | null;
  reason: string;
  policy: ProviderPolicy | null;
  robotsDecision: RobotsDecision | null;
  effectiveCrawlDelaySeconds: number;
}

function hostMatchesDomainRule(hostname: string, domainPattern: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const dom = domainPattern.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  return host === dom || host.endsWith(`.${dom}`);
}

export function matchExclusionRule(
  input: { url: URL; sourceId: string; employerSlug?: string | null },
  exclusions: readonly ExclusionRule[],
): ExclusionRule | null {
  const fullUrlLower = input.url.toString().toLowerCase();
  const sourceLower = input.sourceId.toLowerCase();
  const slugLower = (input.employerSlug ?? '').trim().toLowerCase();

  for (const rule of exclusions) {
    if (!rule.active) continue;
    const val = rule.patternValue.trim().toLowerCase();
    if (!val) continue;
    if (rule.patternType === 'DOMAIN' && hostMatchesDomainRule(input.url.hostname, val)) {
      return rule;
    }
    if (rule.patternType === 'URL_PREFIX' && fullUrlLower.startsWith(val)) {
      return rule;
    }
    if (rule.patternType === 'ATS_BOARD' && sourceLower === val) {
      return rule;
    }
    if (rule.patternType === 'EMPLOYER_SLUG' && slugLower && slugLower === val) {
      return rule;
    }
  }
  return null;
}

export function evaluateSourceCompliance(input: SourceComplianceInput): SourceComplianceDecision {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.targetUrl);
  } catch {
    return {
      allowed: false,
      blockCode: 'INVALID_TARGET_URL',
      reason: 'Target URL could not be parsed.',
      policy: null,
      robotsDecision: null,
      effectiveCrawlDelaySeconds: 0,
    };
  }

  const allExclusions = [...BUILTIN_EXCLUSION_RULES, ...(input.exclusionRules ?? [])];
  const hitExclusion = matchExclusionRule(
    { url: parsedUrl, sourceId: input.sourceId, employerSlug: input.employerSlug },
    allExclusions,
  );
  if (hitExclusion) {
    return {
      allowed: false,
      blockCode: 'EXCLUDED_BY_TAKEDOWN_OR_OPT_OUT',
      reason: `Blocked by exclusion rule (${hitExclusion.patternType}:${hitExclusion.patternValue}, reason=${hitExclusion.reason}).`,
      policy: null,
      robotsDecision: null,
      effectiveCrawlDelaySeconds: 0,
    };
  }

  if (input.enabled === false) {
    return {
      allowed: false,
      blockCode: 'SOURCE_DISABLED',
      reason: `Source ${input.sourceId} is disabled.`,
      policy: null,
      robotsDecision: null,
      effectiveCrawlDelaySeconds: 0,
    };
  }

  const policyMap = input.providerPolicies ?? DEFAULT_PROVIDER_POLICIES;
  const policy = policyMap[input.providerKey.toLowerCase()] ?? null;
  if (!policy) {
    return {
      allowed: false,
      blockCode: 'UNKNOWN_PROVIDER_POLICY',
      reason: `No reviewed provider policy exists for '${input.providerKey}'. Public reachability alone is never sufficient.`,
      policy: null,
      robotsDecision: null,
      effectiveCrawlDelaySeconds: 0,
    };
  }

  const effectivePermission = input.sourceCollectionPermission ?? policy.collectionPermission;
  if (effectivePermission === 'PROHIBITED' || policy.collectionPermission === 'PROHIBITED') {
    return {
      allowed: false,
      blockCode: 'PROVIDER_PROHIBITED',
      reason: `Provider '${policy.providerKey}' is prohibited from automated collection.`,
      policy,
      robotsDecision: null,
      effectiveCrawlDelaySeconds: 0,
    };
  }

  if (
    effectivePermission === 'RESTRICTED_PENDING_REVIEW' ||
    policy.collectionPermission === 'RESTRICTED_PENDING_REVIEW'
  ) {
    return {
      allowed: false,
      blockCode: 'PROVIDER_RESTRICTED_PENDING_REVIEW',
      reason: `Provider '${policy.providerKey}' is held pending explicit legal/partner review.`,
      policy,
      robotsDecision: null,
      effectiveCrawlDelaySeconds: 0,
    };
  }

  const commercialAllowed =
    policy.commercialIndexingAllowed && (input.sourceCommercialIndexingAllowed ?? true);
  if (!commercialAllowed) {
    return {
      allowed: false,
      blockCode: 'COMMERCIAL_INDEXING_NOT_AUTHORIZED',
      reason: `Commercial indexing is not authorized for '${input.sourceId}'.`,
      policy,
      robotsDecision: null,
      effectiveCrawlDelaySeconds: 0,
    };
  }

  const minIntervalSeconds = Math.ceil(60 / Math.max(1, policy.maxRequestsPerMinute));
  let robotsDecision: RobotsDecision | null = null;

  if (policy.requiresRobotsCheck && input.robotsSnapshot) {
    robotsDecision = evaluateRobotsHttpResponse(
      input.robotsSnapshot.httpStatus,
      input.robotsSnapshot.bodyText,
      parsedUrl,
    );
    if (!robotsDecision.allowed) {
      return {
        allowed: false,
        blockCode:
          robotsDecision.disposition === 'TEMPORARY_UNREACHABLE'
            ? 'ROBOTS_TEMPORARILY_UNREACHABLE'
            : 'ROBOTS_DISALLOWED',
        reason: `robots.txt blocked ${parsedUrl.pathname} (${robotsDecision.disposition}).`,
        policy,
        robotsDecision,
        effectiveCrawlDelaySeconds: Math.max(minIntervalSeconds, robotsDecision.crawlDelaySeconds ?? 0),
      };
    }
  }

  return {
    allowed: true,
    blockCode: null,
    reason: 'Authorized by provider policy and technical compliance gates.',
    policy,
    robotsDecision,
    effectiveCrawlDelaySeconds: Math.max(
      minIntervalSeconds,
      robotsDecision?.crawlDelaySeconds ?? 0,
    ),
  };
}
