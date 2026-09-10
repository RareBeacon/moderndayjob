-- 015_resume_studio_2.sql
-- Additive data model for Resume Studio 2.0 conversational drafts.
-- Existing generated_documents remains the immutable generated resume/version table.

create table if not exists public.resume_studio_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'General Resume',
  target_role text,
  target_job_description text,
  selected_template text not null default 'modern-tech',
  current_step text not null default 'welcome',
  content jsonb not null default '{}',
  score jsonb not null default '{}',
  completion integer not null default 0 check (completion >= 0 and completion <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_studio_drafts_user_updated_idx
  on public.resume_studio_drafts(user_id, updated_at desc);

create index if not exists resume_studio_drafts_user_active_idx
  on public.resume_studio_drafts(user_id, is_active, updated_at desc);

alter table public.resume_studio_drafts enable row level security;

drop policy if exists resume_studio_drafts_select_self on public.resume_studio_drafts;
create policy resume_studio_drafts_select_self on public.resume_studio_drafts
  for select using (auth.uid() = user_id);

drop policy if exists resume_studio_drafts_insert_self on public.resume_studio_drafts;
create policy resume_studio_drafts_insert_self on public.resume_studio_drafts
  for insert with check (auth.uid() = user_id);

drop policy if exists resume_studio_drafts_update_self on public.resume_studio_drafts;
create policy resume_studio_drafts_update_self on public.resume_studio_drafts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.resume_studio_drafts is 'Autosaved conversational Resume Studio 2.0 drafts. Generated versions remain append-only in generated_documents.';
comment on column public.resume_studio_drafts.content is 'Structured resume draft JSON collected through the conversational builder. User supplied facts only.';
comment on column public.resume_studio_drafts.score is 'Deterministic resume quality score and explanations. Not AI-fabricated.';
