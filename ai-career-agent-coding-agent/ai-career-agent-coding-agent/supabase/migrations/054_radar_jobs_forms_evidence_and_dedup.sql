-- 054_radar_jobs_forms_evidence_and_dedup.sql
-- Jobiest Global Opportunity Radar (Phase 1):
--   1. radar_jobs: canonical shared global opportunity index with:
--      - separate employer identity vs vacancy authenticity states (Condition 2),
--      - multi-observation expiration tracking (Condition 3),
--      - requisition-preserving 4-tier deduplication + multi-city cluster keys (Condition 5),
--      - mandatory human review on all external application forms,
--      - first-mover lead-time & exclusivity telemetry (Employment Intelligence Network).
--   2. radar_job_sources: multi-source provenance & attribution per canonical vacancy.
--   3. radar_verification_evidence: append-only evidence provenance vault (service_role only).
--   4. radar_application_forms: read-only external form metadata & scam-gate vault.
--   5. Bridge column canonical_radar_job_id on public.jobs.

set search_path = public, extensions;

-- ============================================================================
-- 1) Canonical Global Opportunity Index (public.radar_jobs)
-- ============================================================================
create table if not exists public.radar_jobs (
  id                                   uuid primary key default gen_random_uuid(),
  employer_id                          uuid references public.radar_employers(id) on delete set null,
  recruitment_vacancy_id               uuid references public.recruitment_vacancies(id) on delete set null,
  primary_source_id                    text references public.job_sources(id) on delete set null,

  -- 4-tier requisition-preserving deduplication keys (Condition 5)
  canonical_fingerprint                text not null unique,
  requisition_cluster_key              text not null,
  canonical_url_hash                   text,
  title_company_loc_hash               text not null,
  description_simhash                  text,
  external_requisition_id              text,

  -- Core structured vacancy fields (nullable when unknown; never fabricated)
  title                                text not null,
  normalized_title                     text not null,
  company_name                         text not null,
  department                           text,
  career_category                      text,
  seniority_level                      text,
  employment_type                      text,
  workplace_type                       text not null default 'UNKNOWN' check (
    workplace_type in ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN')
  ),
  location_raw                         text,
  normalized_city                      text,
  state_region                         text,
  country_code                         text,
  country_codes                        text[] not null default '{}',
  remote_region_restriction            text,
  visa_sponsorship                     boolean,
  salary_min                           numeric(14,2),
  salary_max                           numeric(14,2),
  salary_currency                      text,
  salary_period                        text check (
    salary_period is null or salary_period in ('YEAR', 'MONTH', 'WEEK', 'DAY', 'HOUR')
  ),
  skills_required                      text[] not null default '{}',
  skills_preferred                     text[] not null default '{}',
  experience_years_min                 numeric(4,1),
  experience_years_max                 numeric(4,1),
  description_clean                    text not null default '',
  content_hash                         text not null,
  extraction_method                    text not null default 'DETERMINISTIC' check (
    extraction_method in ('DETERMINISTIC', 'HYBRID_DETERMINISTIC_AI', 'AI_ASSISTED')
  ),

  -- Application destination & mandatory human form review gate
  apply_url                            text not null,
  canonical_apply_url                  text not null,
  apply_mechanism                      text not null check (
    apply_mechanism in (
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
      'EXTERNAL_REDIRECT'
    )
  ),
  auto_apply_adapter                   text check (
    auto_apply_adapter is null or auto_apply_adapter in ('greenhouse', 'lever', 'ashby', 'workable')
  ),
  requires_human_form_review           boolean not null default true,

  -- Separate Employer Identity vs Vacancy Authenticity + 3-Axis Scores (Condition 2)
  employer_verification_status         text not null default 'UNVERIFIED' check (
    employer_verification_status in (
      'UNVERIFIED',
      'DOMAIN_EVIDENCE_PENDING',
      'EVIDENCE_VERIFIED',
      'FIRST_PARTY_VERIFIED',
      'IMPERSONATION_QUARANTINED',
      'BLOCKED'
    )
  ),
  vacancy_authenticity_status          text not null default 'UNVERIFIED' check (
    vacancy_authenticity_status in (
      'UNVERIFIED',
      'SOURCE_ATTESTED',
      'DOMAIN_CORROBORATED',
      'FIRST_PARTY_POSTED',
      'SUSPICIOUS_QUARANTINE',
      'SCAM_REJECTED'
    )
  ),
  verified_by_deterministic_evidence   boolean not null default false,
  employer_legitimacy_score            smallint not null default 50 check (
    employer_legitimacy_score >= 0 and employer_legitimacy_score <= 100
  ),
  job_authenticity_score               smallint not null default 50 check (
    job_authenticity_score >= 0 and job_authenticity_score <= 100
  ),
  application_safety_score             smallint not null default 50 check (
    application_safety_score >= 0 and application_safety_score <= 100
  ),
  composite_confidence                 smallint generated always as (
    ((employer_legitimacy_score * 35) + (job_authenticity_score * 35) + (application_safety_score * 30)) / 100
  ) stored,
  verification_status                  text not null default 'PENDING_VERIFICATION' check (
    verification_status in (
      'PENDING_VERIFICATION',
      'VERIFIED_HIGH_TRUST',
      'VERIFIED_STANDARD',
      'UNVERIFIED_EXTERNAL_FORM',
      'SUSPICIOUS_QUARANTINE',
      'SCAM_REJECTED',
      'TAKEDOWN'
    )
  ),
  risk_flags                           text[] not null default '{}',

  -- Multi-observation lifecycle & expiration state (Condition 3)
  lifecycle_status                     text not null default 'ACTIVE' check (
    lifecycle_status in ('ACTIVE', 'POTENTIALLY_CLOSING', 'EXPIRED', 'QUARANTINED', 'TAKEDOWN')
  ),
  missing_poll_streak                  smallint not null default 0 check (missing_poll_streak >= 0),
  first_missing_at                     timestamptz,
  closure_signal                       text not null default 'NONE' check (
    closure_signal in (
      'NONE',
      'AUTHORITATIVE_HTTP_404_410',
      'ATS_CLOSED_FLAG',
      'FORM_CLOSED',
      'FIRST_PARTY_CLOSED',
      'VALID_THROUGH_PASSED',
      'MULTI_POLL_ABSENCE_CONFIRMED'
    )
  ),
  posted_at                            timestamptz,
  valid_through                        timestamptz,
  first_seen_at                        timestamptz not null default now(),
  last_seen_at                         timestamptz not null default now(),
  last_confirmed_live_at               timestamptz not null default now(),
  expired_at                           timestamptz,

  -- Employment Intelligence Network & First-Mover Advantage metrics
  discovery_origin                     text not null default 'DIRECT_ATS_API' check (
    discovery_origin in (
      'FIRST_PARTY_EMPLOYER',
      'DIRECT_ATS_API',
      'DIRECT_EMPLOYER_CAREER_PAGE',
      'DIRECT_EXTERNAL_FORM',
      'COMMUNITY_HIRING_THREAD',
      'PUBLIC_AGGREGATOR_FEED'
    )
  ),
  first_direct_seen_at                 timestamptz,
  first_syndicated_seen_at             timestamptz,
  lead_time_hours                      numeric(8,2),
  exclusivity_tier                     text not null default 'FIRST_MOVER_EXCLUSIVE' check (
    exclusivity_tier in (
      'FIRST_PARTY_EXCLUSIVE',
      'FIRST_MOVER_EXCLUSIVE',
      'EARLY_DIRECT',
      'SYNDICATED'
    )
  ),
  attribution_text                     text,
  created_at                           timestamptz not null default now(),
  updated_at                           timestamptz not null default now(),

  -- Hard invariant A: External forms ALWAYS require human inspection/approval and NEVER bind an auto-apply adapter.
  constraint radar_jobs_external_form_human_gate_chk check (
    (apply_mechanism not in (
      'GOOGLE_FORM', 'TALLY_FORM', 'TYPEFORM', 'JOTFORM',
      'MICROSOFT_FORM', 'AIRTABLE_FORM', 'NOTION_PAGE', 'EMAIL_APPLY', 'EXTERNAL_REDIRECT'
    ))
    or (requires_human_form_review = true and auto_apply_adapter is null)
  ),

  -- Hard invariant B (Condition 2): Verified status requires deterministic evidence + attested vacancy authenticity.
  constraint radar_jobs_deterministic_verification_chk check (
    (verification_status not in ('VERIFIED_HIGH_TRUST', 'VERIFIED_STANDARD'))
    or (
      verified_by_deterministic_evidence = true
      and vacancy_authenticity_status in ('SOURCE_ATTESTED', 'DOMAIN_CORROBORATED', 'FIRST_PARTY_POSTED')
    )
  )
);

create index if not exists radar_jobs_active_search_idx
  on public.radar_jobs (lifecycle_status, verification_status, composite_confidence desc, posted_at desc nulls last);

create index if not exists radar_jobs_cluster_idx
  on public.radar_jobs (requisition_cluster_key);

create index if not exists radar_jobs_employer_idx
  on public.radar_jobs (employer_id, lifecycle_status);

create index if not exists radar_jobs_location_workplace_idx
  on public.radar_jobs (workplace_type, country_code)
  where lifecycle_status = 'ACTIVE';

create index if not exists radar_jobs_skills_gin_idx
  on public.radar_jobs using gin (skills_required);

create index if not exists radar_jobs_exclusivity_idx
  on public.radar_jobs (exclusivity_tier, first_seen_at desc)
  where lifecycle_status = 'ACTIVE';

alter table public.radar_jobs enable row level security;
revoke all on public.radar_jobs from anon, authenticated;

-- ============================================================================
-- 2) Multi-Source Provenance & Attribution (public.radar_job_sources)
-- ============================================================================
create table if not exists public.radar_job_sources (
  id                         uuid primary key default gen_random_uuid(),
  radar_job_id               uuid not null references public.radar_jobs(id) on delete cascade,
  source_id                  text not null references public.job_sources(id) on delete cascade,
  external_id                text not null,
  source_url                 text not null,
  is_direct_employer_source  boolean not null default true,
  attribution_text           text,
  raw_payload_hash           text not null,
  missing_poll_streak        smallint not null default 0 check (missing_poll_streak >= 0),
  first_seen_at              timestamptz not null default now(),
  last_seen_at               timestamptz not null default now(),
  unique (source_id, external_id)
);

create index if not exists radar_job_sources_job_idx
  on public.radar_job_sources (radar_job_id);

alter table public.radar_job_sources enable row level security;
revoke all on public.radar_job_sources from anon, authenticated;

-- ============================================================================
-- 3) Deterministic & AI Verification Evidence Provenance (Condition 2 & 4)
-- ============================================================================
create table if not exists public.radar_verification_evidence (
  id                uuid primary key default gen_random_uuid(),
  subject_type      text not null check (subject_type in ('EMPLOYER', 'JOB', 'FORM')),
  subject_id        uuid not null,
  evidence_kind     text not null check (
    evidence_kind in (
      'FIRST_PARTY_ORG_APPROVAL',
      'CORPORATE_DOMAIN_LINKS_TO_ATS',
      'OFFICIAL_ATS_PUBLIC_API_ATTESTATION',
      'DNS_HTTPS_DOMAIN_RESOLUTION',
      'MX_RECORD_PRESENT',
      'SCHEMA_ORG_ORGANIZATION_MATCH',
      'FORM_DOMAIN_MISMATCH',
      'UPFRONT_FEE_OR_PAYMENT_REQUEST',
      'SENSITIVE_NATIONAL_ID_REQUEST',
      'BRAND_IMPERSONATION_SIGNAL',
      'OFF_PLATFORM_MESSENGER_LURE',
      'AI_RISK_ADVISORY_ONLY'
    )
  ),
  is_deterministic  boolean not null,
  direction         text not null check (direction in ('POSITIVE', 'NEGATIVE', 'NEUTRAL')),
  score_delta       smallint not null default 0 check (score_delta >= -100 and score_delta <= 100),
  evidence_summary  text not null,
  evidence_hash     text not null,
  observed_at       timestamptz not null default now(),
  -- AI advisory signals may NEVER contribute positive verification weight.
  constraint radar_evidence_ai_never_positive_chk check (
    (evidence_kind <> 'AI_RISK_ADVISORY_ONLY')
    or (is_deterministic = false and direction <> 'POSITIVE' and score_delta <= 0)
  ),
  unique (subject_type, subject_id, evidence_kind, evidence_hash)
);

create index if not exists radar_verification_evidence_subject_idx
  on public.radar_verification_evidence (subject_type, subject_id, observed_at desc);

alter table public.radar_verification_evidence enable row level security;
revoke all on public.radar_verification_evidence from anon, authenticated;

-- ============================================================================
-- 4) External Application Form Schema & Safety Vault (service_role only)
-- ============================================================================
create table if not exists public.radar_application_forms (
  id                         uuid primary key default gen_random_uuid(),
  radar_job_id               uuid references public.radar_jobs(id) on delete cascade,
  form_provider              text not null check (
    form_provider in (
      'GOOGLE_FORM', 'TALLY_FORM', 'TYPEFORM', 'JOTFORM',
      'MICROSOFT_FORM', 'AIRTABLE_FORM', 'NOTION_PAGE', 'CUSTOM_HTML_FORM'
    )
  ),
  form_url                   text not null unique,
  form_title                 text,
  fields_schema              jsonb not null default '[]'::jsonb,
  question_count             integer not null default 0 check (question_count >= 0),
  requires_login             boolean not null default false,
  requires_file_upload       boolean not null default false,
  requests_sensitive_id      boolean not null default false,
  requests_payment_or_fee    boolean not null default false,
  is_accepting_responses     boolean not null default true,
  domain_matches_employer    boolean not null default false,
  safety_verdict             text not null default 'MANUAL_LINK_ONLY' check (
    safety_verdict in ('SAFE_FOR_ASSISTED_PREP', 'MANUAL_LINK_ONLY', 'QUARANTINED_SCAM_RISK')
  ),
  schema_hash                text,
  last_inspected_at          timestamptz not null default now(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint radar_forms_fee_or_id_quarantine_chk check (
    (requests_payment_or_fee = false and requests_sensitive_id = false)
    or (safety_verdict = 'QUARANTINED_SCAM_RISK')
  )
);

create index if not exists radar_application_forms_job_idx
  on public.radar_application_forms (radar_job_id);

alter table public.radar_application_forms enable row level security;
revoke all on public.radar_application_forms from anon, authenticated;

-- ============================================================================
-- 5) Non-destructive bridge from public.jobs -> public.radar_jobs
-- ============================================================================
alter table public.jobs
  add column if not exists canonical_radar_job_id uuid references public.radar_jobs(id) on delete set null;

create index if not exists jobs_canonical_radar_job_idx
  on public.jobs (canonical_radar_job_id)
  where canonical_radar_job_id is not null;
