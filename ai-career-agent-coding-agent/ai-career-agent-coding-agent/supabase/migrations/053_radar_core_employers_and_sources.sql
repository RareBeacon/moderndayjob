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
