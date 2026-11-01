-- 047_talent_pool_applications.sql
-- Jobiest Talent Pool: candidate supplementary profiles, applications,
-- immutable application snapshots, and granular 6-purpose consent ledger.
--
-- Reuses auth.users, public.profiles, public.career_profiles,
-- public.job_preferences, public.documents, and public.portfolios without
-- duplicating core account or profile columns.
--
-- Reversible rollback order (manual DBA down-script):
--   drop table if exists public.talent_consents;
--   drop table if exists public.talent_application_snapshots;
--   drop table if exists public.talent_applications;
--   drop table if exists public.talent_pool_profiles;

create table if not exists public.talent_pool_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  location text,
  country text,
  time_zone text,
  career_category text,
  seniority_level text check (
    seniority_level is null
    or seniority_level in ('ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'STAFF_PRINCIPAL', 'LEAD_MANAGER', 'EXECUTIVE')
  ),
  years_of_experience numeric(4,1) check (years_of_experience is null or (years_of_experience >= 0 and years_of_experience <= 60)),
  technical_competencies text[] not null default '{}'::text[],
  certifications jsonb not null default '[]'::jsonb,
  relevant_qualifications text[] not null default '{}'::text[],
  salary_currency text not null default 'USD' check (char_length(salary_currency) between 3 and 6),
  salary_min numeric(12,2) check (salary_min is null or salary_min >= 0),
  salary_max numeric(12,2) check (salary_max is null or (salary_max >= 0 and (salary_min is null or salary_max >= salary_min))),
  availability text check (
    availability is null
    or availability in ('IMMEDIATE', 'TWO_WEEKS', 'ONE_MONTH', 'TWO_TO_THREE_MONTHS', 'OPEN_TO_OFFERS', 'UNAVAILABLE')
  ),
  work_authorization text,
  visibility text not null default 'ACTIVE' check (visibility in ('ACTIVE', 'PAUSED')),
  allow_cv_access boolean not null default false,
  allow_contact_requests boolean not null default true,
  blocked_employer_domains text[] not null default '{}'::text[],
  preferred_assessment_route text not null default 'VIDEO_VOICE' check (
    preferred_assessment_route in ('VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN')
  ),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_pool_profiles_discovery_idx
  on public.talent_pool_profiles (visibility, career_category, seniority_level, availability);

create index if not exists talent_pool_profiles_location_idx
  on public.talent_pool_profiles (country, time_zone);

create index if not exists talent_pool_profiles_competencies_gin_idx
  on public.talent_pool_profiles using gin (technical_competencies);

create index if not exists talent_pool_profiles_qualifications_gin_idx
  on public.talent_pool_profiles using gin (relevant_qualifications);

alter table public.talent_pool_profiles enable row level security;

drop policy if exists "talent_pool_profiles_select_own" on public.talent_pool_profiles;
create policy "talent_pool_profiles_select_own"
  on public.talent_pool_profiles
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "talent_pool_profiles_insert_own" on public.talent_pool_profiles;
create policy "talent_pool_profiles_insert_own"
  on public.talent_pool_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "talent_pool_profiles_update_own" on public.talent_pool_profiles;
create policy "talent_pool_profiles_update_own"
  on public.talent_pool_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.talent_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PROFILE_INCOMPLETE' check (
    status in (
      'PROFILE_INCOMPLETE',
      'APPLICATION_SUBMITTED',
      'ASSESSMENT_PENDING',
      'INTERVIEW_SCHEDULED',
      'ASSESSMENT_IN_PROGRESS',
      'UNDER_ADMIN_REVIEW',
      'REASSESSMENT_REQUESTED',
      'APPROVED',
      'REJECTED',
      'WITHDRAWN'
    )
  ),
  career_category text,
  seniority_level text,
  assessment_route text not null default 'VIDEO_VOICE' check (
    assessment_route in ('VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN')
  ),
  attempt_number integer not null default 1 check (attempt_number >= 1),
  reapplication_permitted boolean not null default false,
  reapplication_allowed_after timestamptz,
  scheduled_interview_at timestamptz,
  submitted_at timestamptz,
  interview_completed_at timestamptz,
  review_submitted_at timestamptz,
  decided_at timestamptz,
  withdrawn_at timestamptz,
  assigned_reviewer_id uuid references auth.users(id) on delete set null,
  candidate_feedback text,
  reassessment_instructions text,
  latest_score numeric(5,2) check (latest_score is null or (latest_score >= 0 and latest_score <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate active applications per candidate unless withdrawn or rejected.
create unique index if not exists talent_applications_one_active_per_user_uidx
  on public.talent_applications (user_id)
  where status in (
    'PROFILE_INCOMPLETE',
    'APPLICATION_SUBMITTED',
    'ASSESSMENT_PENDING',
    'INTERVIEW_SCHEDULED',
    'ASSESSMENT_IN_PROGRESS',
    'UNDER_ADMIN_REVIEW',
    'REASSESSMENT_REQUESTED',
    'APPROVED'
  );

create index if not exists talent_applications_user_created_idx
  on public.talent_applications (user_id, created_at desc);

create index if not exists talent_applications_admin_queue_idx
  on public.talent_applications (status, submitted_at desc, career_category, seniority_level);

create index if not exists talent_applications_reviewer_idx
  on public.talent_applications (assigned_reviewer_id, status)
  where assigned_reviewer_id is not null;

alter table public.talent_applications enable row level security;

drop policy if exists "talent_applications_select_own" on public.talent_applications;
create policy "talent_applications_select_own"
  on public.talent_applications
  for select to authenticated
  using (auth.uid() = user_id);


create table if not exists public.talent_application_snapshots (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.talent_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_data jsonb not null,
  master_cv_document_id uuid references public.documents(id) on delete set null,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  completeness_score integer not null default 0 check (completeness_score >= 0 and completeness_score <= 100),
  created_at timestamptz not null default now()
);

create index if not exists talent_application_snapshots_app_idx
  on public.talent_application_snapshots (application_id, created_at desc);

create index if not exists talent_application_snapshots_user_idx
  on public.talent_application_snapshots (user_id, created_at desc);

alter table public.talent_application_snapshots enable row level security;

drop policy if exists "talent_application_snapshots_select_own" on public.talent_application_snapshots;
create policy "talent_application_snapshots_select_own"
  on public.talent_application_snapshots
  for select to authenticated
  using (auth.uid() = user_id);


create table if not exists public.talent_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.talent_applications(id) on delete set null,
  purpose text not null check (
    purpose in (
      'AI_ASSESSMENT',
      'AUDIO_VIDEO_PROCESSING',
      'INTERVIEW_RECORDING',
      'HUMAN_ASSESSMENT_REVIEW',
      'EMPLOYER_DISCOVERY',
      'DATA_RETENTION_WITHDRAWAL'
    )
  ),
  granted boolean not null,
  consent_version text not null,
  policy_summary text not null,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  ip_hash text,
  ua_hash text,
  created_at timestamptz not null default now()
);

create index if not exists talent_consents_user_purpose_idx
  on public.talent_consents (user_id, purpose, created_at desc);

create index if not exists talent_consents_application_idx
  on public.talent_consents (application_id)
  where application_id is not null;

alter table public.talent_consents enable row level security;

drop policy if exists "talent_consents_select_own" on public.talent_consents;
create policy "talent_consents_select_own"
  on public.talent_consents
  for select to authenticated
  using (auth.uid() = user_id);
