-- =============================================================================
-- Migration 061: Founding Team & Strategic Partnerships Programme + Admin CRM
-- =============================================================================
-- Powers the central Jobiest Founding Team, Collaborator & Strategic Partner
-- application portal (/join) and the Admin CRM (/admin/programme), plus live
-- Strategic Scorecard tracking toward the March 2027 (1,000 Talent / 100 Paid /
-- 50 US & UK Partnerships) and December 2028 ($100,000 Cumulative Revenue)
-- milestones.
--
-- Security Invariants:
--   * RLS enabled on every table with zero permissive anon/authenticated
--     policies; public submissions go strictly through the rate-limited,
--     Zod-validated server endpoint and CRM reads/updates require Admin RBAC.
-- =============================================================================

create table if not exists public.programme_applications (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  track text not null
    check (track in ('JOIN_TEAM', 'PARTNER', 'COLLABORATOR')),
  department text
    check (
      department is null or department in (
        'CONTENT_MEDIA',
        'SALES_BD',
        'STRATEGY_OPS',
        'TECH_PRODUCT',
        'COMMUNITY_CS',
        'PARTNERSHIPS_EXPANSION',
        'EXTERNAL_PARTNER'
      )
    ),
  role_title text not null,
  priority_rank smallint
    check (priority_rank is null or (priority_rank >= 1 and priority_rank <= 10)),
  arrangement text not null
    check (
      arrangement in (
        'INTERNSHIP',
        'VOLUNTEER',
        'PART_TIME',
        'FREELANCE',
        'FULL_TIME',
        'STRATEGIC_PARTNERSHIP'
      )
    ),
  applicant_name text not null,
  applicant_email text not null,
  applicant_phone text,
  country text not null default 'Nigeria',
  city text,
  linkedin_url text,
  portfolio_url text,
  resume_url text,
  organization_name text,
  organization_type text
    check (
      organization_type is null or organization_type in (
        'US_COMPANY',
        'UK_COMPANY',
        'RECRUITMENT_AGENCY',
        'UNIVERSITY',
        'TECH_COMMUNITY',
        'CAREER_ORG',
        'HR_CONSULTING',
        'MARKETING_AGENCY',
        'STARTUP_COMMUNITY',
        'TRAINING_CERTIFICATION',
        'OTHER'
      )
    ),
  organization_website text,
  partnership_market text
    check (
      partnership_market is null or partnership_market in (
        'US',
        'UK',
        'AFRICA',
        'GLOBAL',
        'OTHER'
      )
    ),
  partnership_use_case text,
  availability_hours_per_week int
    check (availability_hours_per_week is null or (availability_hours_per_week >= 1 and availability_hours_per_week <= 80)),
  experience_summary text not null,
  motivation_statement text not null,
  compensation_expectation text,
  terms_acknowledged boolean not null default true,
  status text not null default 'NEW'
    check (
      status in (
        'NEW',
        'UNDER_REVIEW',
        'SHORTLISTED',
        'DISCOVERY_CALL',
        'TRIAL_60_DAY',
        'ACCEPTED',
        'PARTNERSHIP_ACTIVE',
        'ON_HOLD',
        'DECLINED',
        'ARCHIVED'
      )
    ),
  priority_band text not null default 'MEDIUM'
    check (priority_band in ('LOW', 'MEDIUM', 'HIGH', 'TOP_PRIORITY')),
  assigned_coordinator text,
  decision_maker_contact text,
  agreement_documented boolean not null default false,
  verified_partner boolean not null default false,
  review_60_day_at timestamptz,
  next_follow_up_at timestamptz,
  internal_notes text,
  source_channel text,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_programme_applications_track_status
  on public.programme_applications (track, status, created_at desc);

create index if not exists idx_programme_applications_email
  on public.programme_applications (lower(applicant_email), created_at desc);

create index if not exists idx_programme_applications_partner_scorecard
  on public.programme_applications (partnership_market, status, verified_partner)
  where track = 'PARTNER';

alter table public.programme_applications enable row level security;
revoke all on public.programme_applications from anon, authenticated;

create table if not exists public.programme_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.programme_applications(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_programme_application_events_app
  on public.programme_application_events (application_id, created_at desc);

alter table public.programme_application_events enable row level security;
revoke all on public.programme_application_events from anon, authenticated;
