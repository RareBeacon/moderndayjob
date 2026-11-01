import { z } from 'zod';

/**
 * Jobiest Global Opportunity Radar - Core Contracts & Public DTO Boundary
 *
 * Enforces Condition 4 (Database & API Security):
 * Internal crawler state, lease tokens, ETag/payload hashes, absence streaks,
 * candidate-source queues, and raw verification internals NEVER leave the
 * server boundary. External/authenticated callers only ever receive
 * `PublicRadarJobDTO` produced by `toPublicRadarJobDTO()`.
 */

export const COLLECTION_PERMISSIONS = [
  'EXPLICIT_PUBLIC_EMBED_API',
  'FIRST_PARTY_EMPLOYER_POSTED',
  'OPEN_LICENSE_CC0_GOV',
  'OFFICIAL_PARTNER_API_KEY',
  'EMPLOYER_OWNED_CAREER_PAGE_PUBLIC',
  'RESTRICTED_PENDING_REVIEW',
  'PROHIBITED',
] as const;
export type CollectionPermission = (typeof COLLECTION_PERMISSIONS)[number];

export const APPLY_MECHANISMS = [
  'ATS_NATIVE',
  'FIRST_PARTY_PORTAL',
  'DIRECT_CAREER_PAGE',
  'GOOGLE_FORM',
  'TALLY_FORM',
  'TYPEFORM',
  'JOTFORM',
  'MICROSOFT_FORM',
  'AIRTABLE_FORM',
  'NOTION_PAGE',
  'EMAIL_APPLY',
  'EXTERNAL_REDIRECT',
] as const;
export type ApplyMechanism = (typeof APPLY_MECHANISMS)[number];

export const EXTERNAL_FORM_MECHANISMS = new Set<ApplyMechanism>([
  'GOOGLE_FORM',
  'TALLY_FORM',
  'TYPEFORM',
  'JOTFORM',
  'MICROSOFT_FORM',
  'AIRTABLE_FORM',
  'NOTION_PAGE',
  'EMAIL_APPLY',
  'EXTERNAL_REDIRECT',
]);

export const WORKPLACE_TYPES = ['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN'] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const SALARY_PERIODS = ['YEAR', 'MONTH', 'WEEK', 'DAY', 'HOUR'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const EMPLOYER_VERIFICATION_STATUSES = [
  'UNVERIFIED',
  'DOMAIN_EVIDENCE_PENDING',
  'EVIDENCE_VERIFIED',
  'FIRST_PARTY_VERIFIED',
  'IMPERSONATION_QUARANTINED',
  'BLOCKED',
] as const;
export type EmployerVerificationStatus = (typeof EMPLOYER_VERIFICATION_STATUSES)[number];

export const VACANCY_AUTHENTICITY_STATUSES = [
  'UNVERIFIED',
  'SOURCE_ATTESTED',
  'DOMAIN_CORROBORATED',
  'FIRST_PARTY_POSTED',
  'SUSPICIOUS_QUARANTINE',
  'SCAM_REJECTED',
] as const;
export type VacancyAuthenticityStatus = (typeof VACANCY_AUTHENTICITY_STATUSES)[number];

export const JOB_VERIFICATION_STATUSES = [
  'PENDING_VERIFICATION',
  'VERIFIED_HIGH_TRUST',
  'VERIFIED_STANDARD',
  'UNVERIFIED_EXTERNAL_FORM',
  'SUSPICIOUS_QUARANTINE',
  'SCAM_REJECTED',
  'TAKEDOWN',
] as const;
export type JobVerificationStatus = (typeof JOB_VERIFICATION_STATUSES)[number];

export const LIFECYCLE_STATUSES = [
  'ACTIVE',
  'POTENTIALLY_CLOSING',
  'EXPIRED',
  'QUARANTINED',
  'TAKEDOWN',
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const CLOSURE_SIGNALS = [
  'NONE',
  'AUTHORITATIVE_HTTP_404_410',
  'ATS_CLOSED_FLAG',
  'FORM_CLOSED',
  'FIRST_PARTY_CLOSED',
  'VALID_THROUGH_PASSED',
  'MULTI_POLL_ABSENCE_CONFIRMED',
] as const;
export type ClosureSignal = (typeof CLOSURE_SIGNALS)[number];

export const DISCOVERY_ORIGINS = [
  'FIRST_PARTY_EMPLOYER',
  'DIRECT_ATS_API',
  'DIRECT_EMPLOYER_CAREER_PAGE',
  'DIRECT_EXTERNAL_FORM',
  'COMMUNITY_HIRING_THREAD',
  'PUBLIC_AGGREGATOR_FEED',
] as const;
export type DiscoveryOrigin = (typeof DISCOVERY_ORIGINS)[number];

export const EXCLUSIVITY_TIERS = [
  'FIRST_PARTY_EXCLUSIVE',
  'FIRST_MOVER_EXCLUSIVE',
  'EARLY_DIRECT',
  'SYNDICATED',
] as const;
export type ExclusivityTier = (typeof EXCLUSIVITY_TIERS)[number];

export const SUPPORTED_AUTO_APPLY_ADAPTERS = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
] as const;
export type SupportedAutoApplyAdapter = (typeof SUPPORTED_AUTO_APPLY_ADAPTERS)[number];

export interface ProviderPolicy {
  providerKey: string;
  displayName: string;
  collectionPermission: CollectionPermission;
  commercialIndexingAllowed: boolean;
  requiresRobotsCheck: boolean;
  requiresAttribution: boolean;
  attributionTemplate: string | null;
  termsUrl: string | null;
  termsReviewedAt: string | null;
  maxRequestsPerMinute: number;
  defaultPollIntervalMinutes: number;
}

export interface ExclusionRule {
  patternType: 'DOMAIN' | 'URL_PREFIX' | 'EMPLOYER_SLUG' | 'ATS_BOARD';
  patternValue: string;
  reason: 'ROBOTS_DISALLOW' | 'TOS_RESTRICTED' | 'EMPLOYER_OPT_OUT' | 'SCAM_CONFIRMED' | 'ADMIN_BLOCK';
  active: boolean;
}

/** Normalized raw vacancy emitted by an ATS or direct-career adapter before dedup & verification. */
export interface RadarPostingInput {
  providerKey: string;
  sourceId: string;
  externalId: string;
  externalRequisitionId?: string | null;
  companyName: string;
  employerSlugHint?: string | null;
  employerDomainHint?: string | null;
  title: string;
  url: string;
  applyUrl?: string | null;
  descriptionPlain: string;
  locationRaw: string | null;
  city?: string | null;
  stateRegion?: string | null;
  countryCode?: string | null;
  secondaryLocations?: string[];
  workplaceType: WorkplaceType;
  remoteRegionRestriction?: string | null;
  department?: string | null;
  employmentType?: string | null;
  seniorityLevel?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  visaSponsorship?: boolean | null;
  skillsRequired?: string[];
  skillsPreferred?: string[];
  experienceYearsMin?: number | null;
  experienceYearsMax?: number | null;
  extractionMethod?: 'DETERMINISTIC' | 'HYBRID_DETERMINISTIC_AI' | 'AI_ASSISTED';
  postedAt?: string | null;
  updatedAt?: string | null;
  validThrough?: string | null;
  isClosed?: boolean;
  discoveryOrigin: DiscoveryOrigin;
  attributionText?: string | null;
}

export const RadarJobInternalSchema = z.object({
  id: z.string().uuid(),
  employer_id: z.string().uuid().nullable(),
  recruitment_vacancy_id: z.string().uuid().nullable(),
  primary_source_id: z.string().nullable(),
  canonical_fingerprint: z.string().min(16),
  requisition_cluster_key: z.string().min(8),
  canonical_url_hash: z.string().nullable(),
  title_company_loc_hash: z.string().min(16),
  description_simhash: z.string().nullable(),
  external_requisition_id: z.string().nullable(),
  title: z.string().min(1),
  normalized_title: z.string().min(1),
  company_name: z.string().min(1),
  department: z.string().nullable(),
  career_category: z.string().nullable(),
  seniority_level: z.string().nullable(),
  employment_type: z.string().nullable(),
  workplace_type: z.enum(WORKPLACE_TYPES),
  location_raw: z.string().nullable(),
  normalized_city: z.string().nullable(),
  state_region: z.string().nullable(),
  country_code: z.string().nullable(),
  country_codes: z.array(z.string()),
  remote_region_restriction: z.string().nullable(),
  visa_sponsorship: z.boolean().nullable(),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_currency: z.string().nullable(),
  salary_period: z.enum(SALARY_PERIODS).nullable(),
  skills_required: z.array(z.string()),
  skills_preferred: z.array(z.string()),
  experience_years_min: z.number().nullable(),
  experience_years_max: z.number().nullable(),
  description_clean: z.string(),
  content_hash: z.string().min(16),
  extraction_method: z.enum(['DETERMINISTIC', 'HYBRID_DETERMINISTIC_AI', 'AI_ASSISTED']),
  apply_url: z.string().url(),
  canonical_apply_url: z.string(),
  apply_mechanism: z.enum(APPLY_MECHANISMS),
  auto_apply_adapter: z.enum(SUPPORTED_AUTO_APPLY_ADAPTERS).nullable(),
  requires_human_form_review: z.boolean(),
  employer_verification_status: z.enum(EMPLOYER_VERIFICATION_STATUSES),
  vacancy_authenticity_status: z.enum(VACANCY_AUTHENTICITY_STATUSES),
  verified_by_deterministic_evidence: z.boolean(),
  employer_legitimacy_score: z.number().int().min(0).max(100),
  job_authenticity_score: z.number().int().min(0).max(100),
  application_safety_score: z.number().int().min(0).max(100),
  composite_confidence: z.number().int().min(0).max(100),
  verification_status: z.enum(JOB_VERIFICATION_STATUSES),
  risk_flags: z.array(z.string()),
  lifecycle_status: z.enum(LIFECYCLE_STATUSES),
  missing_poll_streak: z.number().int().min(0),
  first_missing_at: z.string().nullable(),
  closure_signal: z.enum(CLOSURE_SIGNALS),
  posted_at: z.string().nullable(),
  valid_through: z.string().nullable(),
  first_seen_at: z.string(),
  last_seen_at: z.string(),
  last_confirmed_live_at: z.string(),
  expired_at: z.string().nullable(),
  discovery_origin: z.enum(DISCOVERY_ORIGINS),
  first_direct_seen_at: z.string().nullable(),
  first_syndicated_seen_at: z.string().nullable(),
  lead_time_hours: z.number().nullable(),
  exclusivity_tier: z.enum(EXCLUSIVITY_TIERS),
  attribution_text: z.string().nullable(),
});

export type RadarJobRow = z.infer<typeof RadarJobInternalSchema>;

/**
 * Whitelisted candidate-facing DTO (Condition 4).
 * Strips internal hashes, crawler streaks, source IDs, and verification evidence hashes.
 */
export interface PublicRadarJobDTO {
  id: string;
  title: string;
  companyName: string;
  department: string | null;
  careerCategory: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  workplaceType: WorkplaceType;
  location: string | null;
  countryCode: string | null;
  remoteRegionRestriction: string | null;
  visaSponsorship: boolean | null;
  salary: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: SalaryPeriod | null;
  } | null;
  skillsRequired: string[];
  description: string;
  applyUrl: string;
  applyMechanism: ApplyMechanism;
  supportsAutoApply: boolean;
  requiresHumanFormReview: boolean;
  trust: {
    verificationStatus: JobVerificationStatus;
    employerVerified: boolean;
    vacancyAttested: boolean;
    confidenceBand: 'HIGH' | 'MEDIUM' | 'CAUTION';
    warnings: string[];
  };
  exclusivityTier: ExclusivityTier;
  postedAt: string | null;
  lastConfirmedLiveAt: string;
  attribution: string | null;
}

export function toPublicRadarJobDTO(row: RadarJobRow): PublicRadarJobDTO {
  const hasSalary = row.salary_min != null || row.salary_max != null;
  const externalForm = EXTERNAL_FORM_MECHANISMS.has(row.apply_mechanism);
  const requiresHumanFormReview = externalForm ? true : row.requires_human_form_review;
  const supportsAutoApply = !externalForm && row.auto_apply_adapter !== null;
  const confidenceBand: 'HIGH' | 'MEDIUM' | 'CAUTION' =
    row.verification_status === 'VERIFIED_HIGH_TRUST' && row.composite_confidence >= 80
      ? 'HIGH'
      : row.verification_status === 'VERIFIED_STANDARD' && row.composite_confidence >= 65
        ? 'MEDIUM'
        : 'CAUTION';

  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name,
    department: row.department,
    careerCategory: row.career_category,
    seniorityLevel: row.seniority_level,
    employmentType: row.employment_type,
    workplaceType: row.workplace_type,
    location: row.location_raw,
    countryCode: row.country_code,
    remoteRegionRestriction: row.remote_region_restriction,
    visaSponsorship: row.visa_sponsorship,
    salary: hasSalary
      ? {
          min: row.salary_min,
          max: row.salary_max,
          currency: row.salary_currency,
          period: row.salary_period,
        }
      : null,
    skillsRequired: [...row.skills_required],
    description: row.description_clean,
    applyUrl: row.apply_url,
    applyMechanism: row.apply_mechanism,
    supportsAutoApply,
    requiresHumanFormReview,
    trust: {
      verificationStatus: row.verification_status,
      employerVerified:
        row.verified_by_deterministic_evidence &&
        (row.employer_verification_status === 'EVIDENCE_VERIFIED' ||
          row.employer_verification_status === 'FIRST_PARTY_VERIFIED'),
      vacancyAttested:
        row.vacancy_authenticity_status === 'SOURCE_ATTESTED' ||
        row.vacancy_authenticity_status === 'DOMAIN_CORROBORATED' ||
        row.vacancy_authenticity_status === 'FIRST_PARTY_POSTED',
      confidenceBand,
      warnings: [...row.risk_flags],
    },
    exclusivityTier: row.exclusivity_tier,
    postedAt: row.posted_at,
    lastConfirmedLiveAt: row.last_confirmed_live_at,
    attribution: row.attribution_text,
  };
}
