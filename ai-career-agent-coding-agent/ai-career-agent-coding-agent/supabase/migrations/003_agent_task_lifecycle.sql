-- Resumable, lease-based agent task lifecycle. Tasks are claimed atomically by trusted workers.
alter table public.agent_tasks add column if not exists lease_token uuid;
alter table public.agent_tasks add column if not exists lease_expires_at timestamptz;
alter table public.agent_tasks add column if not exists next_attempt_at timestamptz not null default now();
alter table public.agent_tasks add column if not exists cancelled_at timestamptz;
alter table public.agent_tasks add column if not exists last_error text;
alter table public.agent_tasks add column if not exists started_at timestamptz;
alter table public.agent_tasks add column if not exists completed_at timestamptz;
create index if not exists agent_tasks_claim_idx on public.agent_tasks(status,next_attempt_at,lease_expires_at);
create or replace function public.claim_agent_tasks(p_limit integer default 5, p_lease_seconds integer default 120)
returns setof public.agent_tasks language plpgsql security definer set search_path=public as $$
declare task_ids uuid[];
begin
  select array_agg(id) into task_ids from (
    select id from public.agent_tasks
    where cancelled_at is null
      and ((status='QUEUED' and next_attempt_at<=now()) or (status='RUNNING' and lease_expires_at<now()))
    order by created_at asc
    for update skip locked
    limit greatest(1,least(p_limit,25))
  ) candidates;
  if task_ids is null then return; end if;
  update public.agent_tasks
  set status='RUNNING', lease_token=gen_random_uuid(), lease_expires_at=now()+make_interval(secs=>p_lease_seconds), started_at=coalesce(started_at,now()), attempts=attempts+1, updated_at=now()
  where id=any(task_ids)
  returning *;
end $$;
create or replace function public.cancel_agent_task(p_task_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.agent_tasks set status='CANCELLED',cancelled_at=now(),lease_token=null,lease_expires_at=null,updated_at=now()
  where id=p_task_id and user_id=p_user_id and status in ('QUEUED','RUNNING','WAITING_APPROVAL');
  return found;
end $$;
