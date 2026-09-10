-- 019_seo_url_audits.sql
-- URL-level technical SEO and indexing status database.

create table if not exists public.seo_url_audits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.seo_projects(id) on delete cascade,
  url text not null,
  status text not null default 'PENDING',
  http_status integer,
  indexable boolean not null default false,
  robots_allowed boolean,
  noindex boolean,
  canonical_url text,
  canonical_ok boolean,
  sitemap_included boolean,
  internally_linked boolean,
  title text,
  meta_description text,
  h1 text,
  structured_data_types text[] not null default '{}',
  mobile_friendly text not null default 'RESPONSIVE_VIEWPORT_CHECK',
  render_ok boolean,
  duplicate_of text,
  indexing_state text not null default 'NOT_INSPECTED',
  last_inspected_at timestamptz,
  google_response jsonb,
  errors text[] not null default '{}',
  last_action text,
  last_action_at timestamptz,
  source text not null default 'crawl',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, url),
  constraint seo_url_audits_status_check check (status in ('PENDING','PASS','WARNING','ERROR','NOINDEX','WAITING_FOR_GOOGLE'))
);

create index if not exists seo_url_audits_project_status_idx on public.seo_url_audits(project_id, status, updated_at desc);
create index if not exists seo_url_audits_project_indexing_idx on public.seo_url_audits(project_id, indexing_state, updated_at desc);

alter table public.seo_url_audits enable row level security;
revoke select, insert, update, delete on public.seo_url_audits from anon, authenticated;

comment on table public.seo_url_audits is 'Definitive technical SEO URL audit and Google indexing status database. Service-role only.';
