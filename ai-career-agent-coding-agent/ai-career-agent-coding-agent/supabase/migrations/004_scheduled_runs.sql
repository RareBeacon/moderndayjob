-- Idempotent daily orchestration records. Scheduler only creates work; workers perform it later.
create table if not exists public.scheduled_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_day date not null,
  run_type text not null,
  status text not null default 'QUEUED',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique(user_id,run_day,run_type)
);
create index if not exists scheduled_runs_status_idx on public.scheduled_runs(status,run_day);
alter table public.scheduled_runs enable row level security;
create policy "scheduled runs owner read" on public.scheduled_runs for select using (auth.uid()=user_id);
create or replace function public.enqueue_daily_discovery(p_day date default current_date)
returns integer language plpgsql security definer set search_path=public as $$
declare count_created integer;
begin
  with eligible as (
    select p.user_id from public.profiles p
    join public.subscriptions s on s.user_id=p.user_id
    where p.account_status='ACTIVE' and s.status in ('TRIAL','ACTIVE_BASIC','ACTIVE_PREMIUM')
  ), inserted as (
    insert into public.scheduled_runs(user_id,run_day,run_type)
    select user_id,p_day,'JOB_DISCOVERY' from eligible
    on conflict(user_id,run_day,run_type) do nothing
    returning id,user_id
  ), tasks as (
    insert into public.agent_tasks(user_id,type,payload)
    select user_id,'JOB_DISCOVERY',jsonb_build_object('run_day',p_day)
    from inserted
    returning id
  ) select count(*) into count_created from tasks;
  return count_created;
end $$;
