-- ============================================================================
-- JOBIEST RADAR COMPLETE NETWORK RELEASE BUNDLE (053..057 - PHASES 1 TO 6)
-- Idempotent one-paste SQL bundle synchronized with individual migrations.
-- ============================================================================
begin;

-- ============================================================================
-- BEGIN MIGRATION: 053_radar_core_employers_and_sources.sql
-- ============================================================================

-- 053_radar_core_employers_and_sources.sql
-- Jobiest Global Opportunity Radar (Phase 1):
--   1. radar_provider_policies: provider-level legal/terms authorization gate
--      (robots.txt is a technical floor, never standalone legal permission).
--   2. radar_employers: global employer intelligence graph + deterministic
--      evidence gate (AI confidence alone can NEVER certify an employer).
--   3. radar_exclusions: domain, URL prefix, employer slug, and board opt-out
--      and takedown registry.
--   4. Non-destructive extension of public.job_sources for adaptive polling,
--      conditional HTTP headers, compliance state, and source leasing.
--
-- Security posture:
--   Every table enables RLS with zero public/authenticated policies and
--   explicitly revokes all privileges from anon and authenticated roles
--   (service_role access only).

set search_path = public, extensions;

-- ============================================================================
-- 1) Provider-specific compliance & authorization policies (Condition 1)
-- ============================================================================
create table if not exists public.radar_provider_policies (
  provider_key                   text primary key,
  display_name                   text not null,
  collection_permission          text not null check (
    collection_permission in (
      'EXPLICIT_PUBLIC_EMBED_API',
      'FIRST_PARTY_EMPLOYER_POSTED',
      'OPEN_LICENSE_CC0_GOV',
      'OFFICIAL_PARTNER_API_KEY',
      'EMPLOYER_OWNED_CAREER_PAGE_PUBLIC',
      'RESTRICTED_PENDING_REVIEW',
      'PROHIBITED'
    )
  ),
  commercial_indexing_allowed    boolean not null default false,
  requires_robots_check          boolean not null default true,
  requires_attribution           boolean not null default true,
  attribution_template           text,
  terms_url                      text,
  terms_reviewed_at              timestamptz,
  max_requests_per_minute        integer not null default 30 check (max_requests_per_minute > 0 and max_requests_per_minute <= 600),
  default_poll_interval_minutes  integer not null default 240 check (default_poll_interval_minutes >= 15),
  notes                          text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  constraint radar_provider_permission_consistency_chk check (
    (collection_permission not in ('RESTRICTED_PENDING_REVIEW', 'PROHIBITED'))
    or (commercial_indexing_allowed = false)
  )
);

alter table public.radar_provider_policies enable row level security;
revoke all on public.radar_provider_policies from anon, authenticated;

insert into public.radar_provider_policies (
  provider_key,
  display_name,
  collection_permission,
  commercial_indexing_allowed,
  requires_robots_check,
  requires_attribution,
  attribution_template,
  terms_url,
  terms_reviewed_at,
  max_requests_per_minute,
  default_poll_interval_minutes,
  notes
) values
  ('first_party', 'Jobiest Employer Portal', 'FIRST_PARTY_EMPLOYER_POSTED', true, false, false,
   'Posted directly by verified employer on Jobiest', 'https://jobiest.com/terms', '2026-11-01T00:00:00Z', 120, 60,
   'First-party vacancies from public.recruitment_vacancies.'),
  ('greenhouse', 'Greenhouse Public Job Board API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Greenhouse board', 'https://www.greenhouse.com/legal', '2026-11-01T00:00:00Z', 60, 120,
   'Documented unauthenticated Job Board API designed for public distribution.'),
  ('lever', 'Lever Postings API (US)', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Lever board', 'https://www.lever.co/legal/', '2026-11-01T00:00:00Z', 60, 120,
   'Documented public postings endpoint (mode=json).'),
  ('lever_eu', 'Lever Postings API (EU)', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Lever EU board', 'https://www.lever.co/legal/', '2026-11-01T00:00:00Z', 60, 120,
   'Documented EU regional public postings endpoint.'),
  ('ashby', 'Ashby Public Posting API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Ashby board', 'https://www.ashbyhq.com/legal', '2026-11-01T00:00:00Z', 60, 120,
   'Documented public job-board posting API with includeCompensation support.'),
  ('workable', 'Workable Public Widget API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Workable board', 'https://www.workable.com/terms', '2026-11-01T00:00:00Z', 40, 240,
   'Documented public widget endpoint (details=true).'),
  ('recruitee', 'Recruitee Public Offers API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Recruitee career site', 'https://recruitee.com/terms', '2026-11-01T00:00:00Z', 40, 240,
   'Public career subdomain offers JSON endpoint.'),
  ('personio', 'Personio Public XML Job Feed', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Personio XML feed', 'https://www.personio.com/legal-notice/', '2026-11-01T00:00:00Z', 30, 360,
   'Documented XML job feed published by employers for external distribution.'),
  ('pinpoint', 'Pinpoint Public Postings Feed', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Pinpoint board', 'https://www.pinpointhq.com/legal/', '2026-11-01T00:00:00Z', 30, 240,
   'Employer-enabled public postings.json endpoint.'),
  ('gem', 'Gem Public Job Board API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Gem board', 'https://www.gem.com/terms', '2026-11-01T00:00:00Z', 30, 240,
   'Public v0 job_board endpoint exposed for employer career sites.'),
  ('polymer', 'Polymer Public Organization Jobs API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Polymer board', 'https://www.polymer.co/terms', '2026-11-01T00:00:00Z', 30, 360,
   'Public v1 hire organization jobs feed.'),
  ('breezy', 'BreezyHR Public Board JSON', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public BreezyHR board', 'https://breezy.hr/terms', '2026-11-01T00:00:00Z', 30, 360,
   'Public /json feed on employer BreezyHR career portals.'),
  ('teamtailor', 'Teamtailor Public Feed', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Listing data from the employer public Teamtailor career portal', 'https://www.teamtailor.com/en/terms/', '2026-11-01T00:00:00Z', 30, 360,
   'Employer-owned public career portal feed; subject to per-domain robots.txt.'),
  ('jsonld_career', 'Employer Direct Career Page (JobPosting JSON-LD)', 'EMPLOYER_OWNED_CAREER_PAGE_PUBLIC', true, true, true,
   'Listing data published on the employer official career website', null, '2026-11-01T00:00:00Z', 12, 360,
   'Requires strict per-origin RFC 9309 robots.txt, Crawl-delay, and meta noindex checks.'),
  ('smartrecruiters', 'SmartRecruiters Postings API', 'RESTRICTED_PENDING_REVIEW', false, true, true,
   'Listing data from SmartRecruiters', 'https://www.smartrecruiters.com/legal/', '2026-11-01T00:00:00Z', 20, 360,
   'Held disabled by default until partner credentials or explicit robots/terms clearance is recorded.'),
  ('remotive_api', 'Remotive API', 'PROHIBITED', false, true, true,
   null, 'https://remotive.com', '2026-11-01T00:00:00Z', 1, 1440,
   'Disallowed by robots.txt (/api/*) and commercial redistribution restrictions.'),
  ('linkedin', 'LinkedIn Jobs', 'PROHIBITED', false, true, false,
   null, 'https://www.linkedin.com/legal/user-agreement', '2026-11-01T00:00:00Z', 1, 1440,
   'Never crawled or automated; Jobiest uses user-clicked deep links only (lib/boardlinks.ts).'),
  ('indeed', 'Indeed Jobs', 'PROHIBITED', false, true, false,
   null, 'https://www.indeed.com/legal', '2026-11-01T00:00:00Z', 1, 1440,
   'Never crawled or automated; Jobiest uses user-clicked deep links only (lib/boardlinks.ts).'),
  ('glassdoor', 'Glassdoor', 'PROHIBITED', false, true, false,
   null, 'https://www.glassdoor.com/about/terms.htm', '2026-11-01T00:00:00Z', 1, 1440,
   'Automated scraping prohibited by terms.'),
  ('wellfound', 'Wellfound', 'PROHIBITED', false, true, false,
   null, 'https://wellfound.com/terms', '2026-11-01T00:00:00Z', 1, 1440,
   'Automated scraping prohibited by terms.')
on conflict (provider_key) do nothing;

-- ============================================================================
-- 2) Global Employer Intelligence Graph (Condition 2 & Strategic Requirement)
-- ============================================================================
create table if not exists public.radar_employers (
  id                                   uuid primary key default gen_random_uuid(),
  employer_organization_id             uuid references public.employer_organizations(id) on delete set null,
  canonical_name                       text not null,
  normalized_slug                      text not null unique check (normalized_slug ~ '^[a-z0-9][a-z0-9-]{0,118}$'),
  primary_domain                       text unique,
  website_url                          text,
  careers_url                          text,
  hiring_infrastructure                jsonb not null default '{}'::jsonb,
  country_code                         text,
  region                               text,
  industry                             text,
  company_size_band                    text,
  discovery_origin                     text not null default 'ATS_REGISTRY_SEED' check (
    discovery_origin in (
      'FIRST_PARTY_PORTAL',
      'ATS_REGISTRY_SEED',
      'COMMON_CRAWL_INDEX',
      'CT_SUBDOMAIN_DISCOVERY',
      'CAREER_LINK_GRAPH',
      'COMMUNITY_HIRING_SIGNAL',
      'MANUAL_CURATION'
    )
  ),
  domain_resolves                      boolean,
  mx_present                           boolean,
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
  verified_by_deterministic_evidence   boolean not null default false,
  employer_legitimacy_score            smallint not null default 50 check (
    employer_legitimacy_score >= 0 and employer_legitimacy_score <= 100
  ),
  active_openings_count                integer not null default 0 check (active_openings_count >= 0),
  first_discovered_at                  timestamptz not null default now(),
  last_verified_at                     timestamptz,
  metadata                             jsonb not null default '{}'::jsonb,
  created_at                           timestamptz not null default now(),
  updated_at                           timestamptz not null default now(),
  -- Condition 2 hard invariant: AI confidence alone can NEVER certify an employer.
  constraint radar_employers_deterministic_cert_chk check (
    (employer_verification_status not in ('EVIDENCE_VERIFIED', 'FIRST_PARTY_VERIFIED'))
    or (verified_by_deterministic_evidence = true)
  )
);

create index if not exists radar_employers_verification_idx
  on public.radar_employers (employer_verification_status, employer_legitimacy_score desc);

create index if not exists radar_employers_org_link_idx
  on public.radar_employers (employer_organization_id)
  where employer_organization_id is not null;

create index if not exists radar_employers_country_idx
  on public.radar_employers (country_code)
  where country_code is not null;

alter table public.radar_employers enable row level security;
revoke all on public.radar_employers from anon, authenticated;

-- ============================================================================
-- 3) Compliance Takedown & Opt-Out Exclusions (Condition 1)
-- ============================================================================
create table if not exists public.radar_exclusions (
  id             uuid primary key default gen_random_uuid(),
  pattern_type   text not null check (pattern_type in ('DOMAIN', 'URL_PREFIX', 'EMPLOYER_SLUG', 'ATS_BOARD')),
  pattern_value  text not null,
  reason         text not null check (
    reason in ('ROBOTS_DISALLOW', 'TOS_RESTRICTED', 'EMPLOYER_OPT_OUT', 'SCAM_CONFIRMED', 'ADMIN_BLOCK')
  ),
  requested_by   text,
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (pattern_type, pattern_value)
);

create index if not exists radar_exclusions_active_idx
  on public.radar_exclusions (pattern_type, pattern_value)
  where active = true;

alter table public.radar_exclusions enable row level security;
revoke all on public.radar_exclusions from anon, authenticated;

insert into public.radar_exclusions (pattern_type, pattern_value, reason, notes) values
  ('DOMAIN', 'linkedin.com', 'TOS_RESTRICTED', 'User-side deep links only; automated crawling prohibited.'),
  ('DOMAIN', 'indeed.com', 'TOS_RESTRICTED', 'User-side deep links only; automated crawling prohibited.'),
  ('DOMAIN', 'glassdoor.com', 'TOS_RESTRICTED', 'Automated crawling prohibited by terms.'),
  ('DOMAIN', 'wellfound.com', 'TOS_RESTRICTED', 'Automated crawling prohibited by terms.'),
  ('URL_PREFIX', 'https://remotive.com/api', 'ROBOTS_DISALLOW', 'Disallowed in remotive.com/robots.txt (/api/*).')
on conflict (pattern_type, pattern_value) do nothing;

-- ============================================================================
-- 4) Non-destructive extension of public.job_sources
-- ============================================================================
alter table public.job_sources drop constraint if exists job_sources_adapter_values;
alter table public.job_sources
  add constraint job_sources_adapter_values check (
    adapter in (
      'greenhouse',
      'lever',
      'lever_eu',
      'ashby',
      'workable',
      'smartrecruiters',
      'recruitee',
      'personio',
      'pinpoint',
      'gem',
      'polymer',
      'breezy',
      'teamtailor',
      'jsonld_career',
      'external_form',
      'public_feed',
      'hn_algolia'
    )
  );

alter table public.job_sources
  add column if not exists employer_id uuid references public.radar_employers(id) on delete set null,
  add column if not exists provider_policy_key text references public.radar_provider_policies(provider_key),
  add column if not exists source_url text,
  add column if not exists collection_permission text not null default 'EXPLICIT_PUBLIC_EMBED_API' check (
    collection_permission in (
      'EXPLICIT_PUBLIC_EMBED_API',
      'FIRST_PARTY_EMPLOYER_POSTED',
      'OPEN_LICENSE_CC0_GOV',
      'OFFICIAL_PARTNER_API_KEY',
      'EMPLOYER_OWNED_CAREER_PAGE_PUBLIC',
      'RESTRICTED_PENDING_REVIEW',
      'PROHIBITED'
    )
  ),
  add column if not exists commercial_indexing_allowed boolean not null default true,
  add column if not exists poll_interval_minutes integer not null default 240 check (poll_interval_minutes >= 15),
  add column if not exists next_poll_at timestamptz not null default now(),
  add column if not exists etag text,
  add column if not exists last_modified_header text,
  add column if not exists last_payload_hash text,
  add column if not exists last_complete_poll_at timestamptz,
  add column if not exists last_item_count integer check (last_item_count is null or last_item_count >= 0),
  add column if not exists robots_status text not null default 'UNKNOWN' check (
    robots_status in ('UNKNOWN', 'ALLOWED', 'DISALLOWED', 'NOT_APPLICABLE_EMBED_API', 'UNREACHABLE')
  ),
  add column if not exists robots_checked_at timestamptz,
  add column if not exists crawl_delay_seconds integer check (crawl_delay_seconds is null or crawl_delay_seconds >= 0),
  add column if not exists priority smallint not null default 50 check (priority >= 0 and priority <= 100),
  add column if not exists trust_level smallint not null default 75 check (trust_level >= 0 and trust_level <= 100),
  add column if not exists discovered_via text not null default 'SEED',
  add column if not exists lease_token text,
  add column if not exists lease_expires_at timestamptz;

update public.job_sources
   set provider_policy_key = adapter,
       robots_status = case
         when adapter in ('greenhouse', 'lever', 'ashby', 'workable') then 'NOT_APPLICABLE_EMBED_API'
         else robots_status
       end
 where provider_policy_key is null
   and adapter in ('greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters');

create index if not exists job_sources_due_poll_idx
  on public.job_sources (next_poll_at asc, priority desc)
  where enabled = true and commercial_indexing_allowed = true;

revoke all on public.job_sources from anon, authenticated;

-- ============================================================================
-- BEGIN MIGRATION: 054_radar_jobs_forms_evidence_and_dedup.sql
-- ============================================================================

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

-- ============================================================================
-- BEGIN MIGRATION: 055_radar_embeddings_runs_and_rpcs.sql
-- ============================================================================

-- 055_radar_embeddings_runs_and_rpcs.sql
-- Jobiest Global Opportunity Radar (Phase 1):
--   1. radar_job_embeddings: vector(384) aligned with talent_rag_chunks (051).
--   2. radar_source_candidates: Employment Intelligence Network discovery queue
--      for newly detected employers, career pages, ATS boards, and forms.
--   3. radar_crawl_runs: crawl/poll telemetry without raw payload exposure.
--   4. Atomic service-role RPCs: claim_due_radar_sources and
--      match_radar_jobs_for_embedding (pinned search_path = public, extensions).

create extension if not exists vector;
set search_path = public, extensions;

-- ============================================================================
-- 1) Semantic Job Embeddings (vector(384) aligned with 051_talent_rag)
-- ============================================================================
create table if not exists public.radar_job_embeddings (
  radar_job_id     uuid primary key references public.radar_jobs(id) on delete cascade,
  embedding        vector(384) not null,
  embedding_model  text not null,
  content_hash     text not null,
  updated_at       timestamptz not null default now()
);

create index if not exists radar_job_embeddings_hnsw_idx
  on public.radar_job_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.radar_job_embeddings enable row level security;
revoke all on public.radar_job_embeddings from anon, authenticated;

-- ============================================================================
-- 2) Candidate Source Queue (Employment Intelligence Network Expansion)
-- ============================================================================
create table if not exists public.radar_source_candidates (
  id                       uuid primary key default gen_random_uuid(),
  discovered_url           text not null unique,
  normalized_host          text not null,
  detected_provider        text,
  detected_board_token     text,
  employer_domain_hint     text,
  discovery_channel        text not null check (
    discovery_channel in (
      'COMMON_CRAWL_CDX',
      'CT_SUBDOMAIN_LOG',
      'EMPLOYER_HOMEPAGE_LINK',
      'COMMUNITY_THREAD_LINK',
      'ADMIN_SUBMISSION'
    )
  ),
  review_status            text not null default 'QUEUED_VALIDATION' check (
    review_status in ('QUEUED_VALIDATION', 'PROMOTED_TO_SOURCE', 'REJECTED_COMPLIANCE', 'REJECTED_DEAD', 'DUPLICATE')
  ),
  rejection_reason         text,
  promoted_source_id       text references public.job_sources(id) on delete set null,
  first_seen_at            timestamptz not null default now(),
  evaluated_at             timestamptz
);

create index if not exists radar_source_candidates_status_idx
  on public.radar_source_candidates (review_status, first_seen_at asc);

alter table public.radar_source_candidates enable row level security;
revoke all on public.radar_source_candidates from anon, authenticated;

-- ============================================================================
-- 3) Crawl Run Telemetry (Condition 4: metrics only, zero raw payload storage)
-- ============================================================================
create table if not exists public.radar_crawl_runs (
  id                       uuid primary key default gen_random_uuid(),
  source_id                text not null references public.job_sources(id) on delete cascade,
  outcome                  text not null check (
    outcome in (
      'OK_COMPLETE',
      'NOT_MODIFIED_304',
      'UNCHANGED_HASH',
      'SKIPPED_COMPLIANCE',
      'SKIPPED_ROBOTS',
      'ANOMALOUS_EMPTY_DROP',
      'HTTP_ERROR',
      'NETWORK_OR_SSRF_BLOCKED',
      'PARSE_ERROR'
    )
  ),
  http_status              integer,
  bytes_fetched            integer not null default 0 check (bytes_fetched >= 0),
  items_seen               integer not null default 0 check (items_seen >= 0),
  items_created            integer not null default 0 check (items_created >= 0),
  items_updated            integer not null default 0 check (items_updated >= 0),
  items_expired            integer not null default 0 check (items_expired >= 0),
  ai_tokens_used           integer not null default 0 check (ai_tokens_used >= 0),
  duration_ms              integer not null default 0 check (duration_ms >= 0),
  error_code               text,
  started_at               timestamptz not null default now(),
  finished_at              timestamptz not null default now()
);

create index if not exists radar_crawl_runs_source_idx
  on public.radar_crawl_runs (source_id, started_at desc);

alter table public.radar_crawl_runs enable row level security;
revoke all on public.radar_crawl_runs from anon, authenticated;

-- ============================================================================
-- 4) Atomic Source Leasing RPC (FOR UPDATE SKIP LOCKED, service_role only)
-- ============================================================================
create or replace function public.claim_due_radar_sources(
  p_limit integer default 10,
  p_lease_seconds integer default 180
)
returns setof public.job_sources
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := encode(gen_random_bytes(16), 'hex');
  v_now timestamptz := now();
begin
  return query
  with due as (
    select s.id
    from public.job_sources s
    left join public.radar_provider_policies p
      on p.provider_key = s.provider_policy_key
    where s.enabled = true
      and s.commercial_indexing_allowed = true
      and coalesce(p.commercial_indexing_allowed, true) = true
      and s.collection_permission not in ('RESTRICTED_PENDING_REVIEW', 'PROHIBITED')
      and s.robots_status <> 'DISALLOWED'
      and (s.cooldown_until is null or s.cooldown_until <= v_now)
      and s.next_poll_at <= v_now
      and (s.lease_expires_at is null or s.lease_expires_at <= v_now)
    order by s.priority desc, s.next_poll_at asc
    limit least(greatest(p_limit, 1), 50)
    for update of s skip locked
  )
  update public.job_sources target
     set lease_token = v_token,
         lease_expires_at = v_now + make_interval(secs => greatest(p_lease_seconds, 30)),
         updated_at = v_now
    from due
   where target.id = due.id
  returning target.*;
end;
$$;

revoke all on function public.claim_due_radar_sources(integer, integer) from public, anon, authenticated;

-- ============================================================================
-- 5) Semantic Opportunity Matching RPC (vector(384), service_role only)
-- ============================================================================
create or replace function public.match_radar_jobs_for_embedding(
  p_query_embedding vector,
  p_workplace_types text[] default null,
  p_min_confidence integer default 60,
  p_limit integer default 25
)
returns table (
  radar_job_id uuid,
  title text,
  company_name text,
  workplace_type text,
  location_raw text,
  country_code text,
  apply_url text,
  apply_mechanism text,
  auto_apply_adapter text,
  requires_human_form_review boolean,
  verification_status text,
  composite_confidence smallint,
  exclusivity_tier text,
  posted_at timestamptz,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if vector_dims(p_query_embedding) <> 384 then
    raise exception 'INVALID_EMBEDDING_DIMENSION_EXPECTED_384';
  end if;

  return query
  select
    j.id as radar_job_id,
    j.title,
    j.company_name,
    j.workplace_type,
    j.location_raw,
    j.country_code,
    j.apply_url,
    j.apply_mechanism,
    j.auto_apply_adapter,
    j.requires_human_form_review,
    j.verification_status,
    j.composite_confidence,
    j.exclusivity_tier,
    j.posted_at,
    (1 - (e.embedding <=> p_query_embedding))::double precision as similarity
  from public.radar_job_embeddings e
  inner join public.radar_jobs j
    on j.id = e.radar_job_id
  where j.lifecycle_status = 'ACTIVE'
    and j.verification_status in ('VERIFIED_HIGH_TRUST', 'VERIFIED_STANDARD', 'UNVERIFIED_EXTERNAL_FORM')
    and j.composite_confidence >= p_min_confidence
    and (p_workplace_types is null or cardinality(p_workplace_types) = 0 or j.workplace_type = any(p_workplace_types))
  order by e.embedding <=> p_query_embedding asc
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.match_radar_jobs_for_embedding(vector, text[], integer, integer) from public, anon, authenticated;

-- ============================================================================
-- BEGIN MIGRATION: 056_radar_phase3_first_party_sync_and_intelligence.sql
-- ============================================================================

-- 056_radar_phase3_first_party_sync_and_intelligence.sql
-- Jobiest Global Opportunity Radar - Phase 3:
--   1. Register Phase 3 open intelligence providers (`hn_whoishiring`, `arbeitnow_api`,
--      `jobicy_api`) in `radar_provider_policies`.
--   2. Automatic First-Party Employer Portal -> Radar sync triggers & backfill
--      (`public.employer_organizations` + `public.recruitment_vacancies` ->
--       `public.radar_employers` + `public.radar_jobs` + deterministic evidence).
--   3. Employment Intelligence Network telemetry RPC (`get_radar_intelligence_summary`)
--      reporting First-Mover exclusivity, lead-time hours, source health, and
--      quarantined scam protections.
--
-- Security (Condition 2 & Condition 4):
--   - First-party certification ONLY triggers when `employer_organizations.verification_status = 'VERIFIED'`.
--   - Suspending or rejecting an organization immediately quarantines its Radar rows.
--   - All SECURITY DEFINER functions pin `set search_path = public, extensions`
--     and revoke execute from `public, anon, authenticated`.

create extension if not exists pgcrypto with schema extensions;

-- 1. Register Phase 3 open intelligence feeds & community signals in `radar_provider_policies`
insert into public.radar_provider_policies (
  provider_key,
  display_name,
  collection_permission,
  commercial_indexing_allowed,
  requires_robots_check,
  requires_attribution,
  attribution_template,
  terms_url,
  terms_reviewed_at,
  max_requests_per_minute,
  default_poll_interval_minutes,
  notes
)
values
  ('hn_whoishiring', 'Hacker News Who is Hiring (Algolia Public API)', 'OPEN_LICENSE_CC0_GOV', true, false, true,
   'Discovered via Hacker News Who is Hiring community thread', 'https://hn.algolia.com/api', '2026-11-01T00:00:00Z', 20, 360,
   'Used to discover direct employer ATS boards, career pages, external forms, and founder-posted roles.'),
  ('arbeitnow_api', 'Arbeitnow Public Job Board API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Syndicated feed attribution: Arbeitnow', 'https://www.arbeitnow.com/blog/job-board-api', '2026-11-01T00:00:00Z', 15, 360,
   'Keyless public JSON feed used with mandatory attribution and First-Mover lead-time benchmarking.'),
  ('jobicy_api', 'Jobicy Public Remote Jobs API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Syndicated feed attribution: Jobicy', 'https://jobicy.com/jobs-rss-feed', '2026-11-01T00:00:00Z', 15, 360,
   'Keyless public remote jobs feed used with mandatory attribution and First-Mover lead-time benchmarking.')
on conflict (provider_key) do nothing;

-- Align `radar_exclusions.reason` and `job_sources_adapter_values` with Phase 3 admin & scout enums
alter table public.radar_exclusions drop constraint if exists radar_exclusions_reason_check;
alter table public.radar_exclusions
  add constraint radar_exclusions_reason_check check (
    reason in (
      'ROBOTS_DISALLOW',
      'ROBOTS_DISALLOWED',
      'TOS_RESTRICTED',
      'TERMS_OF_SERVICE_PROHIBITED',
      'EMPLOYER_OPT_OUT',
      'SCAM_CONFIRMED',
      'CONFIRMED_SCAM_DOMAIN',
      'LEGAL_TAKEDOWN',
      'ADMIN_BLOCK'
    )
  );

alter table public.job_sources drop constraint if exists job_sources_adapter_values;
alter table public.job_sources
  add constraint job_sources_adapter_values check (
    adapter in (
      'greenhouse',
      'lever',
      'lever_eu',
      'ashby',
      'workable',
      'smartrecruiters',
      'recruitee',
      'personio',
      'pinpoint',
      'gem',
      'polymer',
      'breezy',
      'teamtailor',
      'jsonld_career',
      'external_form',
      'public_feed',
      'hn_algolia',
      'hn_whoishiring',
      'arbeitnow_api',
      'jobicy_api'
    )
  );


-- 2. Core helper: sync one `recruitment_vacancies` row into `radar_employers` + `radar_jobs`
create or replace function public.sync_recruitment_vacancy_to_radar_by_id(
  p_vacancy_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_vac public.recruitment_vacancies%rowtype;
  v_org public.employer_organizations%rowtype;
  v_radar_employer_id uuid;
  v_radar_job_id uuid;
  v_workplace text;
  v_fingerprint text;
  v_cluster_key text;
  v_title_loc_hash text;
  v_content_hash text;
  v_apply_url text;
  v_desc text;
  v_domain text;
  v_evidence_hash text;
begin
  select * into v_vac
  from public.recruitment_vacancies
  where id = p_vacancy_id;

  if not found then
    return null;
  end if;

  select * into v_org
  from public.employer_organizations
  where id = v_vac.organization_id;

  if not found then
    return null;
  end if;

  -- Condition 2: Only admin-verified employer organizations may publish into Radar
  if v_org.verification_status <> 'VERIFIED' then
    update public.radar_jobs
       set lifecycle_status = 'QUARANTINED',
           closure_signal = 'FIRST_PARTY_CLOSED',
           updated_at = now()
     where recruitment_vacancy_id = v_vac.id
       and lifecycle_status in ('ACTIVE', 'POTENTIALLY_CLOSING');
    return null;
  end if;

  v_domain := nullif(lower(trim(v_org.business_email_domain)), '');

  -- Upsert canonical Radar employer bridged to `employer_organizations.id`
  insert into public.radar_employers (
    employer_organization_id,
    canonical_name,
    normalized_slug,
    primary_domain,
    website_url,
    careers_url,
    country_code,
    industry,
    discovery_origin,
    employer_verification_status,
    verified_by_deterministic_evidence,
    employer_legitimacy_score,
    last_verified_at,
    updated_at
  )
  values (
    v_org.id,
    v_org.company_name,
    'org-' || v_org.slug,
    v_domain,
    v_org.website_url,
    v_org.website_url,
    case
      when v_org.country is not null and char_length(trim(v_org.country)) = 2
        then upper(trim(v_org.country))
      else null
    end,
    v_org.industry,
    'FIRST_PARTY_PORTAL',
    'FIRST_PARTY_VERIFIED',
    true,
    96,
    coalesce(v_org.verified_at, now()),
    now()
  )
  on conflict (normalized_slug) do update
    set employer_organization_id = excluded.employer_organization_id,
        canonical_name = excluded.canonical_name,
        website_url = coalesce(excluded.website_url, public.radar_employers.website_url),
        careers_url = coalesce(excluded.careers_url, public.radar_employers.careers_url),
        employer_verification_status = 'FIRST_PARTY_VERIFIED',
        verified_by_deterministic_evidence = true,
        employer_legitimacy_score = greatest(public.radar_employers.employer_legitimacy_score, 96),
        last_verified_at = coalesce(v_org.verified_at, now()),
        updated_at = now()
  returning id into v_radar_employer_id;

  v_workplace := case
    when coalesce(v_vac.employment_preference, '') ilike '%remote%'
      or coalesce(v_vac.location, '') ilike '%remote%' then 'REMOTE'
    when coalesce(v_vac.employment_preference, '') ilike '%hybrid%'
      or coalesce(v_vac.location, '') ilike '%hybrid%' then 'HYBRID'
    when coalesce(v_vac.location, '') <> '' then 'ONSITE'
    else 'UNKNOWN'
  end;

  v_desc := coalesce(nullif(trim(v_vac.description), ''), v_vac.title || ' at ' || v_org.company_name);
  v_apply_url := 'https://jobiest.com/talent-pool?vacancy=' || v_vac.id::text;

  v_fingerprint := encode(
    extensions.digest('fp1:' || v_org.id::text || ':' || v_vac.id::text, 'sha256'),
    'hex'
  );
  v_cluster_key := substr(
    encode(
      extensions.digest('fpc:' || lower(trim(v_org.slug)) || ':' || lower(trim(v_vac.title)), 'sha256'),
      'hex'
    ),
    1,
    24
  );
  v_title_loc_hash := encode(
    extensions.digest(
      lower(trim(v_org.company_name)) || '|' || lower(trim(v_vac.title)) || '|' || coalesce(lower(trim(v_vac.location)), '') || '|' || v_workplace,
      'sha256'
    ),
    'hex'
  );
  v_content_hash := encode(extensions.digest(v_desc, 'sha256'), 'hex');

  if v_vac.status <> 'OPEN' then
    update public.radar_jobs
       set lifecycle_status = 'EXPIRED',
           expired_at = coalesce(expired_at, now()),
           closure_signal = 'FIRST_PARTY_CLOSED',
           updated_at = now()
     where recruitment_vacancy_id = v_vac.id
    returning id into v_radar_job_id;
    return v_radar_job_id;
  end if;

  insert into public.radar_jobs (
    employer_id,
    recruitment_vacancy_id,
    canonical_fingerprint,
    requisition_cluster_key,
    canonical_url_hash,
    title_company_loc_hash,
    external_requisition_id,
    title,
    normalized_title,
    company_name,
    career_category,
    seniority_level,
    employment_type,
    workplace_type,
    location_raw,
    country_code,
    salary_min,
    salary_max,
    salary_currency,
    salary_period,
    description_clean,
    content_hash,
    extraction_method,
    apply_url,
    canonical_apply_url,
    apply_mechanism,
    auto_apply_adapter,
    requires_human_form_review,
    employer_verification_status,
    vacancy_authenticity_status,
    verified_by_deterministic_evidence,
    employer_legitimacy_score,
    job_authenticity_score,
    application_safety_score,
    verification_status,
    risk_flags,
    lifecycle_status,
    missing_poll_streak,
    closure_signal,
    posted_at,
    first_seen_at,
    last_seen_at,
    last_confirmed_live_at,
    discovery_origin,
    first_direct_seen_at,
    exclusivity_tier,
    updated_at
  )
  values (
    v_radar_employer_id,
    v_vac.id,
    v_fingerprint,
    v_cluster_key,
    encode(extensions.digest(v_apply_url, 'sha256'), 'hex'),
    v_title_loc_hash,
    v_vac.id::text,
    trim(v_vac.title),
    lower(trim(v_vac.title)),
    v_org.company_name,
    v_vac.career_category,
    v_vac.seniority_level,
    v_vac.employment_preference,
    v_workplace,
    v_vac.location,
    case
      when v_org.country is not null and char_length(trim(v_org.country)) = 2
        then upper(trim(v_org.country))
      else null
    end,
    v_vac.salary_min,
    v_vac.salary_max,
    upper(coalesce(nullif(trim(v_vac.salary_currency), ''), 'USD')),
    case when v_vac.salary_min is not null or v_vac.salary_max is not null then 'YEAR' else null end,
    v_desc,
    v_content_hash,
    'DETERMINISTIC',
    v_apply_url,
    v_apply_url,
    'FIRST_PARTY_PORTAL',
    null,
    false,
    'FIRST_PARTY_VERIFIED',
    'FIRST_PARTY_POSTED',
    true,
    96,
    98,
    98,
    'VERIFIED_HIGH_TRUST',
    '{}'::text[],
    'ACTIVE',
    0,
    'NONE',
    v_vac.created_at,
    v_vac.created_at,
    now(),
    now(),
    'FIRST_PARTY_EMPLOYER',
    v_vac.created_at,
    'FIRST_PARTY_EXCLUSIVE',
    now()
  )
  on conflict (canonical_fingerprint) do update
    set title = excluded.title,
        normalized_title = excluded.normalized_title,
        company_name = excluded.company_name,
        career_category = excluded.career_category,
        seniority_level = excluded.seniority_level,
        employment_type = excluded.employment_type,
        workplace_type = excluded.workplace_type,
        location_raw = excluded.location_raw,
        salary_min = excluded.salary_min,
        salary_max = excluded.salary_max,
        salary_currency = excluded.salary_currency,
        salary_period = excluded.salary_period,
        description_clean = excluded.description_clean,
        content_hash = excluded.content_hash,
        employer_verification_status = 'FIRST_PARTY_VERIFIED',
        vacancy_authenticity_status = 'FIRST_PARTY_POSTED',
        verified_by_deterministic_evidence = true,
        verification_status = 'VERIFIED_HIGH_TRUST',
        lifecycle_status = 'ACTIVE',
        missing_poll_streak = 0,
        first_missing_at = null,
        expired_at = null,
        closure_signal = 'NONE',
        last_seen_at = now(),
        last_confirmed_live_at = now(),
        exclusivity_tier = 'FIRST_PARTY_EXCLUSIVE',
        updated_at = now()
  returning id into v_radar_job_id;

  -- Record deterministic provenance evidence idempotently (`radar_verification_evidence`)
  v_evidence_hash := encode(
    extensions.digest('fp_ev:' || v_org.id::text || ':' || v_vac.id::text, 'sha256'),
    'hex'
  );

  insert into public.radar_verification_evidence (
    subject_type,
    subject_id,
    evidence_kind,
    is_deterministic,
    direction,
    score_delta,
    evidence_summary,
    evidence_hash
  )
  values (
    'JOB',
    v_radar_job_id,
    'FIRST_PARTY_ORG_APPROVAL',
    true,
    'POSITIVE',
    45,
    'Posted directly by verified Jobiest employer organization (' || v_org.company_name || ')',
    v_evidence_hash
  )
  on conflict (subject_type, subject_id, evidence_kind, evidence_hash) do nothing;

  return v_radar_job_id;
end;
$$;

revoke all on function public.sync_recruitment_vacancy_to_radar_by_id(uuid) from public, anon, authenticated;
grant execute on function public.sync_recruitment_vacancy_to_radar_by_id(uuid) to service_role;


-- 3. Trigger functions on `recruitment_vacancies` and `employer_organizations`
create or replace function public.tg_sync_recruitment_vacancy_to_radar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.sync_recruitment_vacancy_to_radar_by_id(new.id);
  return new;
end;
$$;

revoke all on function public.tg_sync_recruitment_vacancy_to_radar() from public, anon, authenticated;
grant execute on function public.tg_sync_recruitment_vacancy_to_radar() to service_role;

drop trigger if exists trg_sync_recruitment_vacancy_to_radar on public.recruitment_vacancies;
create trigger trg_sync_recruitment_vacancy_to_radar
  after insert or update on public.recruitment_vacancies
  for each row
  execute function public.tg_sync_recruitment_vacancy_to_radar();


create or replace function public.tg_sync_employer_org_status_to_radar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  if new.verification_status = 'VERIFIED' and old.verification_status is distinct from 'VERIFIED' then
    for r in
      select id from public.recruitment_vacancies where organization_id = new.id and status = 'OPEN'
    loop
      perform public.sync_recruitment_vacancy_to_radar_by_id(r.id);
    end loop;
  elsif new.verification_status <> 'VERIFIED' and old.verification_status = 'VERIFIED' then
    update public.radar_employers
       set employer_verification_status = case
             when new.verification_status in ('REJECTED', 'SUSPENDED') then 'BLOCKED'
             else 'UNVERIFIED'
           end,
           verified_by_deterministic_evidence = false,
           updated_at = now()
     where employer_organization_id = new.id;

    update public.radar_jobs
       set lifecycle_status = 'QUARANTINED',
           closure_signal = 'FIRST_PARTY_CLOSED',
           updated_at = now()
     where recruitment_vacancy_id in (
       select id from public.recruitment_vacancies where organization_id = new.id
     )
       and lifecycle_status in ('ACTIVE', 'POTENTIALLY_CLOSING');
  end if;
  return new;
end;
$$;

revoke all on function public.tg_sync_employer_org_status_to_radar() from public, anon, authenticated;
grant execute on function public.tg_sync_employer_org_status_to_radar() to service_role;

drop trigger if exists trg_sync_employer_org_status_to_radar on public.employer_organizations;
create trigger trg_sync_employer_org_status_to_radar
  after update of verification_status on public.employer_organizations
  for each row
  execute function public.tg_sync_employer_org_status_to_radar();


-- 4. Idempotent backfill for any existing VERIFIED org OPEN vacancies
do $$
declare
  v_row record;
begin
  for v_row in
    select rv.id
    from public.recruitment_vacancies rv
    join public.employer_organizations eo on eo.id = rv.organization_id
    where eo.verification_status = 'VERIFIED'
  loop
    perform public.sync_recruitment_vacancy_to_radar_by_id(v_row.id);
  end loop;
end;
$$;


-- 5. Employment Intelligence Network Telemetry Summary RPC (service_role only)
create or replace function public.get_radar_intelligence_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_summary jsonb;
begin
  select jsonb_build_object(
    'total_active_jobs', (
      select count(*) from public.radar_jobs where lifecycle_status = 'ACTIVE'
    ),
    'potentially_closing_jobs', (
      select count(*) from public.radar_jobs where lifecycle_status = 'POTENTIALLY_CLOSING'
    ),
    'first_party_exclusive_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'FIRST_PARTY_EXCLUSIVE'
    ),
    'first_mover_exclusive_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'FIRST_MOVER_EXCLUSIVE'
    ),
    'early_direct_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'EARLY_DIRECT'
    ),
    'syndicated_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'SYNDICATED'
    ),
    'avg_lead_time_hours', (
      select round(avg(lead_time_hours)::numeric, 2)
      from public.radar_jobs
      where lead_time_hours is not null and lead_time_hours > 0
    ),
    'verified_employers_count', (
      select count(*) from public.radar_employers
      where employer_verification_status in ('EVIDENCE_VERIFIED', 'FIRST_PARTY_VERIFIED')
    ),
    'pending_source_candidates_count', (
      select count(*) from public.radar_source_candidates where review_status = 'QUEUED_VALIDATION'
    ),
    'scams_rejected_count', (
      select count(*) from public.radar_jobs
      where verification_status in ('SCAM_REJECTED', 'SUSPICIOUS_QUARANTINE')
    ),
    'active_exclusions_count', (
      select count(*) from public.radar_exclusions where active = true
    )
  ) into v_summary;

  return v_summary;
end;
$$;

revoke all on function public.get_radar_intelligence_summary() from public, anon, authenticated;
grant execute on function public.get_radar_intelligence_summary() to service_role;

-- ============================================================================
-- BEGIN MIGRATION: 057_radar_phase4_to_6_alerts_prep_and_autonomous_network.sql
-- ============================================================================

-- ============================================================================
-- Migration 057: Radar Phases 4-6 - Assisted Prep, Candidate Alerts & Autonomous Promotion
-- ============================================================================
-- Completes the 6-Stage Global Employment Intelligence Network:
--   - Stage 4/5: Candidate First-Mover Alert Subscriptions + Deduplicated Delivery Ledger
--   - Stage 6: Safe External Form & Assisted Application Preparation Packs
--              (Mandatory human approval enforced via SQL CHECK constraint)
--   - Autonomous Network Expansion: Validated Public ATS Candidate Promotion RPC
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- 1. Candidate First-Mover Radar Alert Subscriptions (owner-scoped RLS)
create table if not exists public.radar_candidate_alerts (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  enabled             boolean not null default true,
  exclusivity_only    boolean not null default false,
  min_confidence      smallint not null default 75 check (min_confidence >= 50 and min_confidence <= 100),
  workplace_types     text[] not null default '{}',
  target_roles        text[] not null default '{}',
  country_codes       text[] not null default '{}',
  frequency           text not null default 'DAILY' check (frequency in ('DAILY', 'INSTANT', 'PAUSED')),
  email_enabled       boolean not null default false,
  last_notified_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.radar_candidate_alerts enable row level security;

drop policy if exists radar_candidate_alerts_owner_select on public.radar_candidate_alerts;
create policy radar_candidate_alerts_owner_select
  on public.radar_candidate_alerts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists radar_candidate_alerts_owner_insert on public.radar_candidate_alerts;
create policy radar_candidate_alerts_owner_insert
  on public.radar_candidate_alerts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists radar_candidate_alerts_owner_update on public.radar_candidate_alerts;
create policy radar_candidate_alerts_owner_update
  on public.radar_candidate_alerts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists radar_candidate_alerts_owner_delete on public.radar_candidate_alerts;
create policy radar_candidate_alerts_owner_delete
  on public.radar_candidate_alerts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.radar_candidate_alerts from anon;

-- 2. Deduplicated Candidate Alert Delivery Ledger (internal service_role only)
create table if not exists public.radar_alert_deliveries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  radar_job_id    uuid not null references public.radar_jobs(id) on delete cascade,
  channel         text not null default 'IN_APP' check (channel in ('IN_APP', 'IN_APP_AND_EMAIL')),
  match_score     smallint not null default 0 check (match_score >= 0 and match_score <= 100),
  delivered_at    timestamptz not null default now(),
  unique (user_id, radar_job_id)
);

create index if not exists radar_alert_deliveries_user_idx
  on public.radar_alert_deliveries (user_id, delivered_at desc);

alter table public.radar_alert_deliveries enable row level security;
revoke all on public.radar_alert_deliveries from anon, authenticated;

-- 3. Assisted Application Preparation Packs (Stage 6: Mandatory Human Approval)
create table if not exists public.radar_assisted_preparations (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  radar_job_id            uuid not null references public.radar_jobs(id) on delete cascade,
  application_form_id     uuid references public.radar_application_forms(id) on delete set null,
  apply_url               text not null,
  apply_mechanism         text not null,
  tailored_pitch          text not null default '',
  draft_answers           jsonb not null default '[]'::jsonb,
  safety_notes            text[] not null default '{}',
  requires_human_review   boolean not null default true check (requires_human_review = true),
  status                  text not null default 'DRAFT_FOR_HUMAN_REVIEW' check (
    status in ('DRAFT_FOR_HUMAN_REVIEW', 'APPROVED_BY_USER', 'ARCHIVED')
  ),
  human_approved_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, radar_job_id),
  constraint radar_assisted_prep_human_approval_ts_chk check (
    status <> 'APPROVED_BY_USER' or human_approved_at is not null
  )
);

create index if not exists radar_assisted_preparations_user_idx
  on public.radar_assisted_preparations (user_id, updated_at desc);

alter table public.radar_assisted_preparations enable row level security;

drop policy if exists radar_assisted_preparations_owner_select on public.radar_assisted_preparations;
create policy radar_assisted_preparations_owner_select
  on public.radar_assisted_preparations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists radar_assisted_preparations_owner_insert on public.radar_assisted_preparations;
create policy radar_assisted_preparations_owner_insert
  on public.radar_assisted_preparations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and requires_human_review = true);

drop policy if exists radar_assisted_preparations_owner_update on public.radar_assisted_preparations;
create policy radar_assisted_preparations_owner_update
  on public.radar_assisted_preparations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and requires_human_review = true);

revoke all on public.radar_assisted_preparations from anon;

-- 4. Safe Validated Public ATS Candidate Promotion RPC (service_role only)
-- Only promotes queued candidates whose provider has EXPLICIT_PUBLIC_EMBED_API +
-- commercial_indexing_allowed = true AND zero matches in radar_exclusions.
create or replace function public.promote_validated_radar_candidates(
  p_limit integer default 15
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cand record;
  v_source_id text;
  v_promoted integer := 0;
begin
  for v_cand in
    select
      c.id,
      c.discovered_url,
      c.normalized_host,
      lower(trim(c.detected_provider)) as provider_key,
      trim(c.detected_board_token) as board_token,
      c.discovery_channel,
      p.default_poll_interval_minutes
    from public.radar_source_candidates c
    inner join public.radar_provider_policies p
      on p.provider_key = lower(trim(c.detected_provider))
    where c.review_status = 'QUEUED_VALIDATION'
      and c.detected_provider is not null
      and c.detected_board_token is not null
      and trim(c.detected_board_token) ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$'
      and lower(trim(c.detected_provider)) in (
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
        'teamtailor'
      )
      and p.collection_permission = 'EXPLICIT_PUBLIC_EMBED_API'
      and p.commercial_indexing_allowed = true
      and not exists (
        select 1
        from public.radar_exclusions ex
        where ex.active = true
          and (
            (ex.pattern_type = 'DOMAIN' and (
              lower(c.normalized_host) = lower(ex.pattern_value)
              or lower(c.normalized_host) like '%.' || lower(ex.pattern_value)
              or (c.employer_domain_hint is not null and lower(c.employer_domain_hint) = lower(ex.pattern_value))
            ))
            or (ex.pattern_type = 'URL_PREFIX' and lower(c.discovered_url) like lower(ex.pattern_value) || '%')
            or (ex.pattern_type = 'ATS_BOARD' and lower(ex.pattern_value) = lower(trim(c.detected_provider)) || ':' || lower(trim(c.detected_board_token)))
          )
      )
    order by c.first_seen_at asc
    limit least(greatest(p_limit, 1), 50)
  loop
    v_source_id := v_cand.provider_key || ':' || lower(v_cand.board_token);

    insert into public.job_sources (
      id,
      adapter,
      board,
      enabled,
      provider_policy_key,
      source_url,
      collection_permission,
      commercial_indexing_allowed,
      poll_interval_minutes,
      robots_status,
      priority,
      trust_level,
      discovered_via,
      compliance
    )
    values (
      v_source_id,
      v_cand.provider_key,
      lower(v_cand.board_token),
      true,
      v_cand.provider_key,
      v_cand.discovered_url,
      'EXPLICIT_PUBLIC_EMBED_API',
      true,
      coalesce(v_cand.default_poll_interval_minutes, 240),
      'NOT_APPLICABLE_EMBED_API',
      60,
      78,
      v_cand.discovery_channel,
      jsonb_build_object(
        'auto_promoted_at', now(),
        'policy_permission', 'EXPLICIT_PUBLIC_EMBED_API'
      )
    )
    on conflict (id) do nothing;

    update public.radar_source_candidates
       set review_status = 'PROMOTED_TO_SOURCE',
           promoted_source_id = v_source_id,
           evaluated_at = now()
     where id = v_cand.id;

    v_promoted := v_promoted + 1;
  end loop;

  return v_promoted;
end;
$$;

revoke all on function public.promote_validated_radar_candidates(integer) from public, anon, authenticated;
grant execute on function public.promote_validated_radar_candidates(integer) to service_role;

-- 5. Extend Intelligence Summary RPC with Phase 4-6 Network Metrics
create or replace function public.get_radar_intelligence_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_summary jsonb;
begin
  select jsonb_build_object(
    'total_active_jobs', (
      select count(*) from public.radar_jobs where lifecycle_status = 'ACTIVE'
    ),
    'potentially_closing_jobs', (
      select count(*) from public.radar_jobs where lifecycle_status = 'POTENTIALLY_CLOSING'
    ),
    'first_party_exclusive_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'FIRST_PARTY_EXCLUSIVE'
    ),
    'first_mover_exclusive_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'FIRST_MOVER_EXCLUSIVE'
    ),
    'early_direct_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'EARLY_DIRECT'
    ),
    'syndicated_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'SYNDICATED'
    ),
    'avg_lead_time_hours', (
      select round(avg(lead_time_hours)::numeric, 2)
      from public.radar_jobs
      where lead_time_hours is not null and lead_time_hours > 0
    ),
    'verified_employers_count', (
      select count(*) from public.radar_employers
      where employer_verification_status in ('EVIDENCE_VERIFIED', 'FIRST_PARTY_VERIFIED')
    ),
    'pending_source_candidates_count', (
      select count(*) from public.radar_source_candidates where review_status = 'QUEUED_VALIDATION'
    ),
    'scams_rejected_count', (
      select count(*) from public.radar_jobs
      where verification_status in ('SCAM_REJECTED', 'SUSPICIOUS_QUARANTINE')
    ),
    'active_exclusions_count', (
      select count(*) from public.radar_exclusions where active = true
    ),
    'inspected_forms_count', (
      select count(*) from public.radar_application_forms
    ),
    'assisted_preparations_count', (
      select count(*) from public.radar_assisted_preparations
    ),
    'active_alert_subscribers_count', (
      select count(*) from public.radar_candidate_alerts where enabled = true and frequency <> 'PAUSED'
    )
  ) into v_summary;

  return v_summary;
end;
$$;

revoke all on function public.get_radar_intelligence_summary() from public, anon, authenticated;
grant execute on function public.get_radar_intelligence_summary() to service_role;

commit;
