-- 027_saved_jobs.sql
-- Mobile product capability: per-user saved jobs (bookmarks).
-- Additive only; no existing table is touched. Service-role writes/reads via
-- the API (RLS on, no client policies) so entitlement/audit rules stay in
-- the API layer, exactly like support_messages.
create table if not exists public.saved_jobs(
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index if not exists saved_jobs_user_created_idx on public.saved_jobs(user_id, created_at desc);
alter table public.saved_jobs enable row level security;
