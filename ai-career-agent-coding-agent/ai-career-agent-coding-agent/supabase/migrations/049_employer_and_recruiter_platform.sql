-- 049_employer_and_recruiter_platform.sql
-- Jobiest Talent Pool: employer organizations, recruiter memberships,
-- employer verification workflow, saved candidates, shortlists, vacancies,
-- recruitment pipelines, and placement records.
--
-- Reversible rollback order (manual DBA down-script):
--   drop table if exists public.talent_placements;
--   drop table if exists public.recruitment_pipeline_entries;
--   drop table if exists public.employer_shortlist_candidates;
--   drop table if exists public.employer_shortlists;
--   drop table if exists public.recruitment_vacancies;
--   drop table if exists public.employer_saved_candidates;
--   drop table if exists public.employer_verifications;
--   drop table if exists public.employer_members;
--   drop table if exists public.employer_organizations;

create table if not exists public.employer_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}$'),
  company_name text not null,
  website_url text not null,
  company_description text not null,
  industry text not null,
  company_location text not null,
  country text,
  business_email text not null,
  business_email_domain text not null,
  authorized_representative_name text not null,
  authorized_representative_role text,
  verification_status text not null default 'PENDING' check (
    verification_status in ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED')
  ),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employer_organizations_status_idx
  on public.employer_organizations (verification_status, created_at desc);

create index if not exists employer_organizations_domain_idx
  on public.employer_organizations (business_email_domain);

alter table public.employer_organizations enable row level security;


create table if not exists public.employer_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'RECRUITER' check (role in ('OWNER', 'ADMIN', 'RECRUITER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INVITED', 'REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists employer_members_user_idx
  on public.employer_members (user_id, status);

create index if not exists employer_members_org_idx
  on public.employer_members (organization_id, status);

alter table public.employer_members enable row level security;

drop policy if exists "employer_members_select_own" on public.employer_members;
create policy "employer_members_select_own"
  on public.employer_members
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "employer_organizations_select_member" on public.employer_organizations;
create policy "employer_organizations_select_member"
  on public.employer_organizations
  for select to authenticated
  using (
    exists (
      select 1
      from public.employer_members m
      where m.organization_id = employer_organizations.id
        and m.user_id = auth.uid()
        and m.status = 'ACTIVE'
    )
  );


create table if not exists public.employer_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  business_registration_ref text,
  corporate_domain_matched boolean not null default false,
  supporting_notes text,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists employer_verifications_org_idx
  on public.employer_verifications (organization_id, created_at desc);

alter table public.employer_verifications enable row level security;


create table if not exists public.employer_saved_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  saved_by uuid not null references auth.users(id) on delete restrict,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, candidate_user_id)
);

create index if not exists employer_saved_candidates_org_idx
  on public.employer_saved_candidates (organization_id, created_at desc);

alter table public.employer_saved_candidates enable row level security;


create table if not exists public.recruitment_vacancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  career_category text,
  seniority_level text,
  location text,
  employment_preference text,
  salary_currency text not null default 'USD',
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  description text,
  status text not null default 'OPEN' check (status in ('OPEN', 'PAUSED', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_vacancies_org_idx
  on public.recruitment_vacancies (organization_id, status, created_at desc);

alter table public.recruitment_vacancies enable row level security;


create table if not exists public.employer_shortlists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  vacancy_id uuid references public.recruitment_vacancies(id) on delete set null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employer_shortlists_org_idx
  on public.employer_shortlists (organization_id, created_at desc);

alter table public.employer_shortlists enable row level security;


create table if not exists public.employer_shortlist_candidates (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.employer_shortlists(id) on delete cascade,
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  unique (shortlist_id, candidate_user_id)
);

create index if not exists employer_shortlist_candidates_shortlist_idx
  on public.employer_shortlist_candidates (shortlist_id, created_at desc);

alter table public.employer_shortlist_candidates enable row level security;


create table if not exists public.recruitment_pipeline_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  vacancy_id uuid references public.recruitment_vacancies(id) on delete set null,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null default 'SHORTLISTED' check (
    stage in (
      'SHORTLISTED',
      'CONTACT_REQUESTED',
      'IN_CONVERSATION',
      'INTERVIEWING',
      'OFFER_EXTENDED',
      'HIRED',
      'ARCHIVED'
    )
  ),
  updated_by uuid not null references auth.users(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_pipeline_entries_org_stage_idx
  on public.recruitment_pipeline_entries (organization_id, stage, updated_at desc);

alter table public.recruitment_pipeline_entries enable row level security;


create table if not exists public.talent_placements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete restrict,
  vacancy_id uuid references public.recruitment_vacancies(id) on delete set null,
  candidate_user_id uuid not null references auth.users(id) on delete restrict,
  application_id uuid references public.talent_applications(id) on delete set null,
  role_title text not null,
  employment_type text,
  salary_currency text not null default 'USD',
  agreed_annual_salary numeric(12,2),
  start_date date,
  status text not null default 'OFFER_ACCEPTED' check (
    status in ('OFFER_ACCEPTED', 'STARTED', 'CONFIRMED_90_DAYS', 'CANCELLED')
  ),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_placements_org_idx
  on public.talent_placements (organization_id, status, created_at desc);

create index if not exists talent_placements_candidate_idx
  on public.talent_placements (candidate_user_id, created_at desc);

alter table public.talent_placements enable row level security;
