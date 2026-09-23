-- 040: Portfolio Studio (Enterprise upgrade Milestone 6, owner decisions
-- D1 portfolio limits 1/5/10/26 as RECORD limits, D5 hosted portfolios at
-- /portfolio/<slug> first).
--
-- portfolios stores the user's portfolio record; slugs are unique and a
-- rename keeps the previous slug for a permanent redirect. Content is a
-- jsonb `data` blob rendered by the app (React auto-escaping server-side;
-- the HTML export escapes again), so no raw HTML is ever stored or served.
-- Visibility: PRIVATE (default, owner only), UNLISTED (reachable by link,
-- excluded from sitemap), PUBLIC (in the sitemap).
--
-- Limits are record counts per plan (NOT spendable ledger credits, per the
-- owner's D1 amendment): FREE 1, BASIC 5, PREMIUM 10, MAX 26.

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  previous_slug text,
  title text not null default 'My portfolio',
  template_id text not null default 'clean',
  data jsonb not null default '{}'::jsonb,
  visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE', 'UNLISTED', 'PUBLIC')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists portfolios_previous_slug_uidx
  on public.portfolios (previous_slug)
  where previous_slug is not null;

create index if not exists portfolios_public_idx
  on public.portfolios (slug, visibility);

alter table public.portfolios enable row level security;
-- No policies: service-role only, same pattern as 027/037/038. All reads
-- and writes go through the app's server routes with explicit checks.

alter table public.subscription_plans
  add column if not exists portfolio_limit int not null default 1;

update public.subscription_plans set portfolio_limit = 1  where code = 'FREE';
update public.subscription_plans set portfolio_limit = 5  where code = 'BASIC';
update public.subscription_plans set portfolio_limit = 10 where code = 'PREMIUM';
update public.subscription_plans set portfolio_limit = 26 where code = 'MAX';
