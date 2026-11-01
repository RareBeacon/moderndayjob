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
