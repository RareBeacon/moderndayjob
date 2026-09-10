-- 021_seo_conversion_events.sql
-- Article, free-tool, and signup attribution for the SEO lead-generation engine.

create table if not exists public.seo_conversion_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.seo_projects(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  event_name text not null,
  article_slug text,
  source_url text,
  target_url text,
  tool_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint seo_conversion_events_event_check check (event_name in ('article_tool_click','tool_view_from_article','tool_start_from_article','tool_completion_from_article','signup_created_from_article','signup_created_from_tool'))
);

create index if not exists seo_conversion_events_project_created_idx on public.seo_conversion_events(project_id, created_at desc);
create index if not exists seo_conversion_events_article_idx on public.seo_conversion_events(article_slug, created_at desc);
create index if not exists seo_conversion_events_tool_idx on public.seo_conversion_events(tool_id, created_at desc);
create index if not exists seo_conversion_events_user_idx on public.seo_conversion_events(user_id, created_at desc);

alter table public.seo_conversion_events enable row level security;
revoke select, insert, update, delete on public.seo_conversion_events from anon, authenticated;

comment on table public.seo_conversion_events is 'Server-recorded SEO funnel events for article to tool clicks, tool usage from articles, and article-assisted signup conversions. Service-role only.';
