-- 006_job_preferences.sql
-- Stores each user's job-search preferences captured during onboarding.
-- Written via the service role server-side (/api/preferences); RLS permits owner reads.
create table if not exists public.job_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  remote_types text[] not null default '{}',
  locations text[] not null default '{}',
  employment_types text[] not null default '{}',
  salary_min numeric(12,2),
  currency text not null default 'NGN',
  application_mode text not null default 'approval',
  daily_target int not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.job_preferences enable row level security;
drop policy if exists preferences_self on public.job_preferences;
create policy preferences_self on public.job_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
comment on table public.job_preferences is 'User job-search preferences (remote types, locations, employment types, salary floor, application mode, daily target).';
