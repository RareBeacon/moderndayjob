-- =============================================================================
-- Jobiest Nov 2, 2026 One-Paste Supabase SQL Bundle (Migrations 047 -> 052)
-- Safe, idempotent, additive-only (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Enables RLS on 100% of tables, configures pgvector RAG, creates the private
-- `talent-recordings` bucket, and hardens `public.ai_credentials` RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 047_talent_pool_applications.sql
-- -----------------------------------------------------------------------------
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
-- END MIGRATION: 047_talent_pool_applications.sql

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 048_talent_interviews_and_assessments.sql
-- -----------------------------------------------------------------------------
-- 048_talent_interviews_and_assessments.sql
-- Jobiest Talent Pool: AI interview sessions, state machine, questions,
-- answers, transcripts, private recordings bucket, structured assessment
-- reports, competency dimensions, and audited administrator reviews.
--
-- Reversible rollback order (manual DBA down-script):
--   drop table if exists public.talent_admin_reviews;
--   drop table if exists public.talent_assessment_dimensions;
--   drop table if exists public.talent_assessment_reports;
--   drop table if exists public.talent_interview_transcripts;
--   drop table if exists public.talent_interview_answers;
--   drop table if exists public.talent_interview_recordings;
--   drop table if exists public.talent_interview_questions;
--   drop table if exists public.talent_interview_sessions;

create table if not exists public.talent_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.talent_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'VIDEO_VOICE' check (
    mode in ('VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN')
  ),
  state text not null default 'CREATED' check (
    state in (
      'CREATED',
      'PRECHECK',
      'READY',
      'IN_PROGRESS',
      'PROCESSING',
      'COMPLETED',
      'SUBMITTED_FOR_REVIEW',
      'FAILED',
      'RETRY_PENDING',
      'CANCELLED'
    )
  ),
  camera_permission text not null default 'UNCHECKED' check (
    camera_permission in ('UNCHECKED', 'GRANTED', 'DENIED', 'NOT_APPLICABLE')
  ),
  microphone_permission text not null default 'UNCHECKED' check (
    microphone_permission in ('UNCHECKED', 'GRANTED', 'DENIED', 'NOT_APPLICABLE')
  ),
  recording_active boolean not null default false,
  current_question_index integer not null default 0 check (current_question_index >= 0),
  total_questions integer not null default 0 check (total_questions >= 0),
  graph_state jsonb not null default '{}'::jsonb,
  network_drop_count integer not null default 0 check (network_drop_count >= 0),
  last_heartbeat_at timestamptz,
  precheck_completed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  submitted_for_review_at timestamptz,
  failure_reason text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_interview_sessions_app_idx
  on public.talent_interview_sessions (application_id, created_at desc);

create index if not exists talent_interview_sessions_user_state_idx
  on public.talent_interview_sessions (user_id, state, updated_at desc);

alter table public.talent_interview_sessions enable row level security;

drop policy if exists "talent_interview_sessions_select_own" on public.talent_interview_sessions;
create policy "talent_interview_sessions_select_own"
  on public.talent_interview_sessions
  for select to authenticated
  using (auth.uid() = user_id);


create table if not exists public.talent_interview_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.talent_interview_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 1),
  parent_question_id uuid references public.talent_interview_questions(id) on delete set null,
  competency_key text not null,
  competency_label text not null,
  difficulty text not null default 'CORE' check (difficulty in ('FOUNDATIONAL', 'CORE', 'ADVANCED', 'FOLLOWUP')),
  question_text text not null,
  rubric_criteria jsonb not null default '[]'::jsonb,
  is_followup boolean not null default false,
  asked_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, sequence_no)
);

create index if not exists talent_interview_questions_session_idx
  on public.talent_interview_questions (session_id, sequence_no);

alter table public.talent_interview_questions enable row level security;

drop policy if exists "talent_interview_questions_select_own" on public.talent_interview_questions;
create policy "talent_interview_questions_select_own"
  on public.talent_interview_questions
  for select to authenticated
  using (auth.uid() = user_id);


create table if not exists public.talent_interview_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.talent_interview_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid references public.talent_interview_questions(id) on delete set null,
  segment_index integer not null check (segment_index >= 0),
  bucket_id text not null default 'talent-recordings',
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  sha256 text not null,
  has_video boolean not null default false,
  has_audio boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, segment_index)
);

create index if not exists talent_interview_recordings_session_idx
  on public.talent_interview_recordings (session_id, segment_index);

alter table public.talent_interview_recordings enable row level security;
-- Service-role mediated access only: signed URLs are minted server-side after
-- ownership or administrator verification + fail-closed audit logging.


create table if not exists public.talent_interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.talent_interview_sessions(id) on delete cascade,
  question_id uuid not null references public.talent_interview_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_modality text not null default 'VOICE' check (input_modality in ('VOICE', 'WRITTEN')),
  answer_transcript text not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  stt_provider text,
  stt_confidence numeric(4,3) check (stt_confidence is null or (stt_confidence >= 0 and stt_confidence <= 1)),
  recording_id uuid references public.talent_interview_recordings(id) on delete set null,
  evaluation_notes jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (session_id, question_id)
);

create index if not exists talent_interview_answers_session_idx
  on public.talent_interview_answers (session_id, submitted_at);

alter table public.talent_interview_answers enable row level security;
-- Service-role mediated so internal evaluation_notes stay server-controlled.


create table if not exists public.talent_interview_transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.talent_interview_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  speaker text not null check (speaker in ('INTERVIEWER', 'CANDIDATE', 'SYSTEM')),
  turn_index integer not null check (turn_index >= 0),
  content text not null,
  start_ms integer check (start_ms is null or start_ms >= 0),
  end_ms integer check (end_ms is null or end_ms >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index if not exists talent_interview_transcripts_session_idx
  on public.talent_interview_transcripts (session_id, turn_index);

alter table public.talent_interview_transcripts enable row level security;
-- Private transcripts are admin-reviewed only and never exposed to recruiters.


create table if not exists public.talent_assessment_reports (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.talent_applications(id) on delete cascade,
  session_id uuid not null unique references public.talent_interview_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall_score numeric(5,2) not null check (overall_score >= 0 and overall_score <= 100),
  calibrated_level text not null,
  assessment_modality text not null check (assessment_modality in ('VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN')),
  executive_summary text not null,
  recruiter_summary text not null,
  strengths jsonb not null default '[]'::jsonb,
  growth_areas jsonb not null default '[]'::jsonb,
  scoring_explanations jsonb not null default '{}'::jsonb,
  ai_confidence numeric(4,3) not null default 0.75 check (ai_confidence >= 0 and ai_confidence <= 1),
  evidence_limitations jsonb not null default '[]'::jsonb,
  technical_flags jsonb not null default '[]'::jsonb,
  integrity_flags jsonb not null default '[]'::jsonb,
  truthfulness_report jsonb not null default '{}'::jsonb,
  model_provider text,
  model_name text,
  created_at timestamptz not null default now()
);

create index if not exists talent_assessment_reports_app_idx
  on public.talent_assessment_reports (application_id, created_at desc);

create index if not exists talent_assessment_reports_score_idx
  on public.talent_assessment_reports (overall_score desc);

alter table public.talent_assessment_reports enable row level security;
-- Accessed strictly through server-side DTOs so internal flags and raw scoring
-- payloads are separated between candidate, recruiter, and administrator views.


create table if not exists public.talent_assessment_dimensions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.talent_assessment_reports(id) on delete cascade,
  application_id uuid not null references public.talent_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dimension_key text not null,
  dimension_label text not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  max_score numeric(5,2) not null default 100 check (max_score > 0),
  weight numeric(4,3) not null default 0.2 check (weight >= 0 and weight <= 1),
  confidence numeric(4,3) not null default 0.75 check (confidence >= 0 and confidence <= 1),
  rationale text not null,
  evidence_quotes jsonb not null default '[]'::jsonb,
  employer_visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (report_id, dimension_key)
);

create index if not exists talent_assessment_dimensions_app_idx
  on public.talent_assessment_dimensions (application_id, dimension_key, score desc);

alter table public.talent_assessment_dimensions enable row level security;


create table if not exists public.talent_admin_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.talent_applications(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('APPROVE', 'REJECT', 'REQUEST_REASSESSMENT')),
  reason text,
  candidate_feedback text,
  reassessment_instructions text,
  internal_notes text,
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default now(),
  check (
    decision = 'APPROVE'
    or (reason is not null and char_length(btrim(reason)) >= 5)
  )
);

create index if not exists talent_admin_reviews_app_idx
  on public.talent_admin_reviews (application_id, created_at desc);

create index if not exists talent_admin_reviews_reviewer_idx
  on public.talent_admin_reviews (reviewer_id, created_at desc);

alter table public.talent_admin_reviews enable row level security;
-- Service-role only: internal_notes are strictly administrator-confidential.


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talent-recordings',
  'talent-recordings',
  false,
  10485760,
  array['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
-- END MIGRATION: 048_talent_interviews_and_assessments.sql

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 049_employer_and_recruiter_platform.sql
-- -----------------------------------------------------------------------------
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
-- END MIGRATION: 049_employer_and_recruiter_platform.sql

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 050_talent_interactions_and_messaging.sql
-- -----------------------------------------------------------------------------
-- 050_talent_interactions_and_messaging.sql
-- Jobiest Talent Pool: employer contact requests, interview invitations,
-- candidate-authorized messaging threads, and abuse/misconduct reporting.
--
-- Reversible rollback order (manual DBA down-script):
--   drop table if exists public.talent_interaction_reports;
--   drop table if exists public.talent_messages;
--   drop table if exists public.talent_conversations;
--   drop table if exists public.talent_contact_requests;

create table if not exists public.talent_contact_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  vacancy_id uuid references public.recruitment_vacancies(id) on delete set null,
  request_type text not null check (request_type in ('CONTACT_REQUEST', 'INTERVIEW_INVITATION')),
  role_title text not null,
  message text not null,
  proposed_slots jsonb not null default '[]'::jsonb,
  meeting_format text,
  compensation_range text,
  status text not null default 'PENDING' check (
    status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'REPORTED')
  ),
  candidate_response_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_contact_requests_candidate_idx
  on public.talent_contact_requests (candidate_user_id, status, created_at desc);

create index if not exists talent_contact_requests_org_idx
  on public.talent_contact_requests (organization_id, status, created_at desc);

alter table public.talent_contact_requests enable row level security;

drop policy if exists "talent_contact_requests_candidate_read" on public.talent_contact_requests;
create policy "talent_contact_requests_candidate_read"
  on public.talent_contact_requests
  for select to authenticated
  using (auth.uid() = candidate_user_id);


create table if not exists public.talent_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  contact_request_id uuid references public.talent_contact_requests(id) on delete set null,
  subject text not null,
  status text not null default 'ACTIVE' check (
    status in ('PENDING_CANDIDATE', 'ACTIVE', 'DECLINED', 'REPORTED', 'ARCHIVED')
  ),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, candidate_user_id)
);

create index if not exists talent_conversations_candidate_idx
  on public.talent_conversations (candidate_user_id, last_message_at desc);

create index if not exists talent_conversations_org_idx
  on public.talent_conversations (organization_id, last_message_at desc);

alter table public.talent_conversations enable row level security;

drop policy if exists "talent_conversations_participant_read" on public.talent_conversations;
create policy "talent_conversations_participant_read"
  on public.talent_conversations
  for select to authenticated
  using (
    auth.uid() = candidate_user_id
    or exists (
      select 1
      from public.employer_members m
      where m.organization_id = talent_conversations.organization_id
        and m.user_id = auth.uid()
        and m.status = 'ACTIVE'
    )
  );


create table if not exists public.talent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.talent_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  sender_role text not null check (sender_role in ('RECRUITER', 'CANDIDATE')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists talent_messages_conversation_idx
  on public.talent_messages (conversation_id, created_at asc);

alter table public.talent_messages enable row level security;

drop policy if exists "talent_messages_participant_read" on public.talent_messages;
create policy "talent_messages_participant_read"
  on public.talent_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.talent_conversations c
      where c.id = talent_messages.conversation_id
        and (
          c.candidate_user_id = auth.uid()
          or exists (
            select 1
            from public.employer_members m
            where m.organization_id = c.organization_id
              and m.user_id = auth.uid()
              and m.status = 'ACTIVE'
          )
        )
    )
  );


create table if not exists public.talent_interaction_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  reporter_role text not null check (reporter_role in ('CANDIDATE', 'RECRUITER')),
  organization_id uuid references public.employer_organizations(id) on delete set null,
  candidate_user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.talent_conversations(id) on delete set null,
  contact_request_id uuid references public.talent_contact_requests(id) on delete set null,
  reason_category text not null check (
    reason_category in ('SPAM', 'HARASSMENT', 'SCAM_OR_FRAUD', 'OFF_PLATFORM_SOLICITATION', 'MISREPRESENTATION', 'OTHER')
  ),
  details text not null check (char_length(btrim(details)) between 10 and 2000),
  status text not null default 'OPEN' check (
    status in ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')
  ),
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists talent_interaction_reports_status_idx
  on public.talent_interaction_reports (status, created_at desc);

alter table public.talent_interaction_reports enable row level security;
-- END MIGRATION: 050_talent_interactions_and_messaging.sql

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 051_talent_rag_and_langgraph_checkpoints.sql
-- -----------------------------------------------------------------------------
-- 051_talent_rag_and_langgraph_checkpoints.sql
-- RAG pgvector document/chunk index, versioned assessment contexts,
-- personalized interview blueprints, and persistent LangGraph checkpoints.

create extension if not exists vector;
set search_path = public, extensions;

create table if not exists public.talent_rag_documents (
  id uuid primary key default gen_random_uuid(),
  namespace text not null check (namespace in ('CANDIDATE_KNOWLEDGE', 'JOB_COMPETENCY_KNOWLEDGE', 'ASSESSMENT_KNOWLEDGE')),
  candidate_user_id uuid references auth.users(id) on delete cascade,
  source_document_id uuid,
  document_type text not null,
  source text not null,
  career_category text,
  job_title text,
  experience_level text,
  version integer not null default 1 check (version >= 1),
  content_sha256 text not null,
  chunk_count integer not null default 0 check (chunk_count >= 0),
  pii_redacted boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  indexed_at timestamptz not null default now(),
  stale_at timestamptz,
  created_at timestamptz not null default now(),
  constraint talent_rag_candidate_isolation_chk check (
    (namespace = 'CANDIDATE_KNOWLEDGE' and candidate_user_id is not null)
    or (namespace <> 'CANDIDATE_KNOWLEDGE' and candidate_user_id is null)
  )
);

create index if not exists idx_talent_rag_docs_candidate
  on public.talent_rag_documents(candidate_user_id, is_active, document_type);

create index if not exists idx_talent_rag_docs_shared
  on public.talent_rag_documents(namespace, career_category, experience_level, is_active);

create unique index if not exists uq_talent_rag_docs_active_hash
  on public.talent_rag_documents(coalesce(candidate_user_id, '00000000-0000-0000-0000-000000000000'::uuid), namespace, document_type, content_sha256)
  where is_active is true;

alter table public.talent_rag_documents enable row level security;

drop policy if exists "talent_rag_documents_owner_select" on public.talent_rag_documents;
create policy "talent_rag_documents_owner_select"
  on public.talent_rag_documents
  for select
  to authenticated
  using (
    (namespace = 'CANDIDATE_KNOWLEDGE' and candidate_user_id = auth.uid())
    or (namespace in ('JOB_COMPETENCY_KNOWLEDGE', 'ASSESSMENT_KNOWLEDGE') and auth.uid() is not null)
  );

create table if not exists public.talent_rag_chunks (
  id uuid primary key default gen_random_uuid(),
  document_ref_id uuid not null references public.talent_rag_documents(id) on delete cascade,
  namespace text not null check (namespace in ('CANDIDATE_KNOWLEDGE', 'JOB_COMPETENCY_KNOWLEDGE', 'ASSESSMENT_KNOWLEDGE')),
  candidate_user_id uuid references auth.users(id) on delete cascade,
  source_document_id uuid,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_text text not null,
  token_estimate integer not null default 0 check (token_estimate >= 0),
  career_category text,
  job_title text,
  skills text[] not null default '{}',
  experience_level text,
  document_type text not null,
  source text not null,
  version integer not null default 1 check (version >= 1),
  embedding vector(384) not null,
  embedding_model text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint talent_rag_chunks_candidate_isolation_chk check (
    (namespace = 'CANDIDATE_KNOWLEDGE' and candidate_user_id is not null)
    or (namespace <> 'CANDIDATE_KNOWLEDGE' and candidate_user_id is null)
  ),
  unique (document_ref_id, chunk_index)
);

create index if not exists idx_talent_rag_chunks_candidate
  on public.talent_rag_chunks(candidate_user_id, namespace, document_type);

create index if not exists idx_talent_rag_chunks_shared
  on public.talent_rag_chunks(namespace, career_category, experience_level);

create index if not exists idx_talent_rag_chunks_skills
  on public.talent_rag_chunks using gin (skills);

alter table public.talent_rag_chunks enable row level security;

drop policy if exists "talent_rag_chunks_owner_select" on public.talent_rag_chunks;
create policy "talent_rag_chunks_owner_select"
  on public.talent_rag_chunks
  for select
  to authenticated
  using (
    (namespace = 'CANDIDATE_KNOWLEDGE' and candidate_user_id = auth.uid())
    or (namespace in ('JOB_COMPETENCY_KNOWLEDGE', 'ASSESSMENT_KNOWLEDGE') and auth.uid() is not null)
  );

create or replace function public.match_talent_rag_chunks(
  p_query_embedding vector(384),
  p_namespace text,
  p_candidate_user_id uuid default null,
  p_career_category text default null,
  p_experience_level text default null,
  p_document_type text default null,
  p_match_count integer default 8
)
returns table (
  chunk_id uuid,
  document_ref_id uuid,
  source_document_id uuid,
  namespace text,
  candidate_user_id uuid,
  chunk_index integer,
  chunk_text text,
  career_category text,
  job_title text,
  skills text[],
  experience_level text,
  document_type text,
  source text,
  version integer,
  metadata jsonb,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if p_namespace = 'CANDIDATE_KNOWLEDGE' and p_candidate_user_id is null then
    raise exception 'CANDIDATE_ID_REQUIRED_FOR_CANDIDATE_RAG';
  end if;

  return query
  select
    c.id as chunk_id,
    c.document_ref_id,
    c.source_document_id,
    c.namespace,
    c.candidate_user_id,
    c.chunk_index,
    c.chunk_text,
    c.career_category,
    c.job_title,
    c.skills,
    c.experience_level,
    c.document_type,
    c.source,
    c.version,
    c.metadata,
    (1 - (c.embedding <=> p_query_embedding))::double precision as similarity
  from public.talent_rag_chunks c
  inner join public.talent_rag_documents d on d.id = c.document_ref_id and d.is_active is true
  where c.namespace = p_namespace
    and (
      (p_namespace = 'CANDIDATE_KNOWLEDGE' and c.candidate_user_id = p_candidate_user_id)
      or (p_namespace <> 'CANDIDATE_KNOWLEDGE' and c.candidate_user_id is null)
    )
    and (p_career_category is null or c.career_category is null or c.career_category = p_career_category)
    and (p_experience_level is null or c.experience_level is null or c.experience_level = p_experience_level)
    and (p_document_type is null or c.document_type = p_document_type)
  order by c.embedding <=> p_query_embedding asc
  limit least(greatest(p_match_count, 1), 25);
end;
$$;

create table if not exists public.talent_assessment_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.talent_applications(id) on delete set null,
  context_version integer not null default 1 check (context_version >= 1),
  prompt_version text not null,
  career_category text,
  professional_title text,
  seniority_level text,
  years_of_experience numeric(4,1),
  completeness_score numeric(5,2) not null default 0,
  eligible_for_interview boolean not null default false,
  candidate_confirmed boolean not null default false,
  candidate_confirmed_at timestamptz,
  declared_claims jsonb not null default '{}'::jsonb,
  document_extracted_claims jsonb not null default '{}'::jsonb,
  verified_evidence jsonb not null default '{}'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  contradictory_information jsonb not null default '[]'::jsonb,
  analysis_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_assessment_contexts_user
  on public.talent_assessment_contexts(user_id, created_at desc);

alter table public.talent_assessment_contexts enable row level security;

drop policy if exists "talent_assessment_contexts_owner_select" on public.talent_assessment_contexts;
create policy "talent_assessment_contexts_owner_select"
  on public.talent_assessment_contexts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "talent_assessment_contexts_owner_update" on public.talent_assessment_contexts;
create policy "talent_assessment_contexts_owner_update"
  on public.talent_assessment_contexts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.talent_interview_blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.talent_applications(id) on delete cascade,
  session_id uuid references public.talent_interview_sessions(id) on delete set null,
  assessment_context_id uuid references public.talent_assessment_contexts(id) on delete set null,
  blueprint_version integer not null default 1 check (blueprint_version >= 1),
  prompt_version text not null,
  career_category text not null,
  professional_title text not null,
  seniority_level text not null,
  question_count integer not null check (question_count >= 1 and question_count <= 30),
  estimated_duration_minutes integer not null default 25,
  questions_json jsonb not null default '[]'::jsonb,
  quality_validation_json jsonb not null default '{}'::jsonb,
  rag_citations_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_talent_blueprints_app
  on public.talent_interview_blueprints(application_id, created_at desc);

alter table public.talent_interview_blueprints enable row level security;

drop policy if exists "talent_interview_blueprints_owner_select" on public.talent_interview_blueprints;
create policy "talent_interview_blueprints_owner_select"
  on public.talent_interview_blueprints
  for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.talent_workflow_checkpoints (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.talent_applications(id) on delete cascade,
  session_id uuid references public.talent_interview_sessions(id) on delete set null,
  idempotency_key text not null,
  current_node text not null,
  completed_nodes text[] not null default '{}',
  workflow_status text not null check (workflow_status in (
    'RUNNING', 'AWAITING_CANDIDATE_CONFIRMATION', 'AWAITING_CANDIDATE_ANSWER',
    'PAUSED_INTERRUPTION', 'COMPLETED', 'FAILED'
  )),
  state_json jsonb not null default '{}'::jsonb,
  interruption_reason text,
  error_code text,
  total_input_tokens integer not null default 0,
  total_output_tokens integer not null default 0,
  estimated_cost_usd numeric(10,6) not null default 0,
  total_latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_workflow_checkpoints_user
  on public.talent_workflow_checkpoints(user_id, updated_at desc);

create index if not exists idx_talent_workflow_checkpoints_session
  on public.talent_workflow_checkpoints(session_id);

alter table public.talent_workflow_checkpoints enable row level security;

drop policy if exists "talent_workflow_checkpoints_owner_select" on public.talent_workflow_checkpoints;
create policy "talent_workflow_checkpoints_owner_select"
  on public.talent_workflow_checkpoints
  for select
  to authenticated
  using (user_id = auth.uid());
-- END MIGRATION: 051_talent_rag_and_langgraph_checkpoints.sql

-- -----------------------------------------------------------------------------
-- BEGIN MIGRATION: 052_cybersecurity_admin_and_userdata_hardening.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Migration 052: Cybersecurity, User Data & Admin Panel Hardening
-- =============================================================================
-- Security invariants enforced:
--   1. Lock down `public.ai_credentials` against direct PostgREST client reads:
--      migration 010 left `ai_credentials_self` (`for select using (auth.uid() = user_id)`),
--      which exposed `ciphertext` and full `base_url` directly to user JWTs if
--      exfiltrated via XSS or token theft. Dropping `ai_credentials_self` while
--      keeping RLS enabled (zero client policies) causes PostgREST to return
--      `200 []` (0 rows) to both `anon` and `authenticated` (preserving the
--      daily `self-scan` contract while completely blocking ciphertext reads).
--      All legitimate reads/writes run server-side via `/api/credentials` and
--      `/api/admin/credentials` using `service_role`, stripping `ciphertext`.
--   2. Enforce database-level `http(s)://` scheme check on
--      `public.employer_organizations.website_url` (`NOT VALID` for safe online
--      rollout without locking existing rows) so `javascript:` / `data:` URLs
--      cannot be persisted even if an upstream caller bypasses Zod validation.
--   3. Re-assert RLS + write revocations on `admin_users`, `admin_actions`,
--      `audit_logs`, and `security_events` (idempotent defense-in-depth).
-- =============================================================================

alter table if exists public.ai_credentials enable row level security;
drop policy if exists ai_credentials_self on public.ai_credentials;
revoke insert, update, delete on public.ai_credentials from anon, authenticated;

alter table if exists public.admin_users enable row level security;
revoke select, insert, update, delete on public.admin_users from anon, authenticated;

alter table if exists public.admin_actions enable row level security;
revoke select, insert, update, delete on public.admin_actions from anon, authenticated;

alter table if exists public.audit_logs enable row level security;
revoke insert, update, delete on public.audit_logs from anon, authenticated;

alter table if exists public.security_events enable row level security;
revoke select, insert, update, delete on public.security_events from anon, authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'employer_organizations'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'employer_organizations_website_url_http_chk'
  ) then
    alter table public.employer_organizations
      add constraint employer_organizations_website_url_http_chk
      check (website_url ~* '^https?://[^\s/$.?#].[^\s]*$') not valid;
  end if;
end $$;
-- END MIGRATION: 052_cybersecurity_admin_and_userdata_hardening.sql

-- -----------------------------------------------------------------------------
-- POST-RUN VERIFICATION SUMMARY (returns 1 row confirming activation)
-- -----------------------------------------------------------------------------
select
  (
    select count(*)::int
    from information_schema.tables
    where table_schema = 'public'
      and (
        table_name like 'talent_%'
        or table_name like 'employer_%'
        or table_name like 'recruitment_%'
      )
  ) as talent_and_employer_tables_ready,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_talent_rag_chunks'
  ) as rag_vector_rpc_ready,
  exists (
    select 1
    from storage.buckets
    where id = 'talent-recordings' and public = false
  ) as private_recordings_bucket_ready,
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_credentials'
      and policyname = 'ai_credentials_self'
  ) as ai_credentials_ciphertext_locked_down;
