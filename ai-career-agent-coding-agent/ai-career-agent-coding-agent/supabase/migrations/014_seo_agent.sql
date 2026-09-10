-- 014_seo_agent.sql
-- Autonomous SEO Agent foundation.
--
-- Security model: all SEO control/credential/analytics tables are service-role
-- only. Admin pages and routes access them after requireAdmin(); no client role
-- can read Google tokens, Search Console data, or autonomous action logs.

create table if not exists public.seo_projects (
  id uuid primary key default gen_random_uuid(),
  domain text not null default 'https://jobiest.com',
  search_console_property text,
  sitemap_url text not null default 'https://jobiest.com/sitemap.xml',
  status text not null default 'SETUP_REQUIRED',
  mode text not null default 'DRAFT',
  paused boolean not null default true,
  google_oauth_ciphertext text,
  google_refresh_ciphertext text,
  google_token_expires_at timestamptz,
  last_audit_at timestamptz,
  last_sync_at timestamptz,
  settings jsonb not null default '{
    "newArticlesRequireApproval": false,
    "existingArticleUpdatesRequireApproval": true,
    "metaTitleChangesAutonomous": true,
    "internalLinksAutonomous": true,
    "canonicalChangesRequireApproval": true,
    "redirectsRequireApproval": true,
    "maxArticlesPerDay": 1
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_projects_mode_check check (mode in ('DRAFT','AUTONOMOUS')),
  constraint seo_projects_status_check check (status in ('SETUP_REQUIRED','CONNECTED','ACTIVE','PAUSED','ERROR'))
);

create unique index if not exists seo_projects_singleton_idx on public.seo_projects ((true));

insert into public.seo_projects (domain, sitemap_url, status, mode, paused)
values ('https://jobiest.com', 'https://jobiest.com/sitemap.xml', 'SETUP_REQUIRED', 'DRAFT', true)
on conflict do nothing;

create table if not exists public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.seo_projects(id) on delete cascade,
  keyword text not null,
  intent text not null default 'informational',
  priority text not null default 'MEDIUM',
  target_url text,
  position numeric,
  impressions int,
  clicks int,
  ctr numeric,
  opportunity_score numeric,
  metric_source text not null default 'unavailable',
  metric_confidence text not null default 'unavailable',
  cannibalization_risk text not null default 'unknown',
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(project_id, keyword)
);

create table if not exists public.seo_articles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.seo_projects(id) on delete cascade,
  title text not null,
  slug text not null,
  url text not null,
  target_keyword text,
  secondary_keywords text[] not null default '{}',
  semantic_keywords text[] not null default '{}',
  search_intent text,
  meta_title text,
  meta_description text,
  canonical_url text,
  featured_image_alt text,
  status text not null default 'DRAFT',
  content_markdown text not null default '',
  quality_report jsonb not null default '{}'::jsonb,
  indexing_status text not null default 'NOT_INSPECTED',
  published_at timestamptz,
  last_index_inspection_at timestamptz,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(project_id, slug),
  constraint seo_articles_status_check check (status in ('DRAFT','SCHEDULED','PUBLISHED','NEEDS_UPDATE','UNDERPERFORMING','ARCHIVED'))
);

create table if not exists public.seo_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.seo_projects(id) on delete cascade,
  date date not null,
  url text,
  query text,
  country text,
  device text,
  search_appearance text,
  dimensions_key text not null,
  clicks int not null default 0,
  impressions int not null default 0,
  ctr numeric not null default 0,
  average_position numeric not null default 0,
  source text not null default 'google_search_console',
  imported_at timestamptz not null default now(),
  unique(project_id, date, dimensions_key)
);

create table if not exists public.seo_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.seo_projects(id) on delete cascade,
  task text not null,
  status text not null default 'QUEUED',
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  constraint seo_agent_tasks_status_check check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED','SKIPPED'))
);

create table if not exists public.seo_audit_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.seo_projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.seo_indexing_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.seo_projects(id) on delete cascade,
  url text not null,
  request_type text not null,
  mechanism text not null,
  status text not null default 'RECORDED',
  google_response jsonb,
  reason text,
  requested_at timestamptz not null default now(),
  unique(project_id, url, mechanism, request_type)
);

alter table public.seo_projects enable row level security;
alter table public.seo_keywords enable row level security;
alter table public.seo_articles enable row level security;
alter table public.seo_metrics enable row level security;
alter table public.seo_agent_tasks enable row level security;
alter table public.seo_audit_logs enable row level security;
alter table public.seo_indexing_requests enable row level security;

revoke select, insert, update, delete on public.seo_projects from anon, authenticated;
revoke select, insert, update, delete on public.seo_keywords from anon, authenticated;
revoke select, insert, update, delete on public.seo_articles from anon, authenticated;
revoke select, insert, update, delete on public.seo_metrics from anon, authenticated;
revoke select, insert, update, delete on public.seo_agent_tasks from anon, authenticated;
revoke select, insert, update, delete on public.seo_audit_logs from anon, authenticated;
revoke select, insert, update, delete on public.seo_indexing_requests from anon, authenticated;

create index if not exists seo_keywords_project_score_idx on public.seo_keywords(project_id, opportunity_score desc nulls last);
create index if not exists seo_articles_project_status_idx on public.seo_articles(project_id, status, published_at desc nulls last);
create index if not exists seo_metrics_project_date_idx on public.seo_metrics(project_id, date desc);
create index if not exists seo_tasks_project_created_idx on public.seo_agent_tasks(project_id, created_at desc);
create index if not exists seo_audit_project_created_idx on public.seo_audit_logs(project_id, created_at desc);

comment on table public.seo_projects is 'SEO project configuration and encrypted Google OAuth tokens. Service-role only.';
comment on table public.seo_articles is 'SEO content inventory and generated/published article records.';
comment on table public.seo_metrics is 'Google Search Console performance metrics, never fabricated.';
