-- 016_free_tools_2.sql
-- Free Tools 2.0 lead-magnet analytics and authenticated saved outputs.

create table if not exists public.free_tool_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  tool_id text not null,
  event_name text not null,
  step text,
  authenticated boolean not null default false,
  generation_success boolean,
  completion_rate integer check (completion_rate is null or (completion_rate >= 0 and completion_rate <= 100)),
  time_to_completion_ms integer,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists free_tool_events_tool_created_idx on public.free_tool_events(tool_id, created_at desc);
create index if not exists free_tool_events_user_created_idx on public.free_tool_events(user_id, created_at desc);
create index if not exists free_tool_events_anon_created_idx on public.free_tool_events(anonymous_id, created_at desc);

alter table public.free_tool_events enable row level security;
revoke select, insert, update, delete on public.free_tool_events from anon, authenticated;

create table if not exists public.free_tool_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anonymous_id text,
  tool_id text not null,
  title text not null,
  answers jsonb not null default '{}',
  result jsonb not null default '{}',
  result_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists free_tool_results_user_created_idx on public.free_tool_results(user_id, created_at desc);
create index if not exists free_tool_results_tool_created_idx on public.free_tool_results(tool_id, created_at desc);

alter table public.free_tool_results enable row level security;

drop policy if exists free_tool_results_select_self on public.free_tool_results;
create policy free_tool_results_select_self on public.free_tool_results
  for select using (auth.uid() = user_id);

revoke insert, update, delete on public.free_tool_results from anon, authenticated;

comment on table public.free_tool_events is 'Server-recorded funnel analytics for public free tools. Writes happen through service role only.';
comment on table public.free_tool_results is 'Authenticated saved free-tool results. Anonymous previews are not persisted until signup/login.';
