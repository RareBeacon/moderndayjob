-- 023_observability_ledgers.sql — Phase 2 observability (B-060/B-061/B-063)
-- Master Implementation Package Part VII, mapped onto the existing repo tables:
--   * ai_usage is the new AI usage/cost ledger (package §98, §332). It records
--     BOTH generation paths: provider runs through the AI gateway AND the
--     deterministic builders the product routes use today. user_id is nullable
--     because the free tools are anonymous; ip_hash (HMAC, never raw IP) keys
--     the anonymous abuse budgets. No prompt content, ever: only a content
--     hash, feature, provider, tokens, latency and status.
--   * audit_logs gains outcome / request_id / ip_hash / ua_hash columns
--     (package §10.2 audit_events shape, mapped onto the existing table).
--   * admin_user_overview is recreated WITHOUT the email column: the admin
--     list shows email_domain only. Full email is revealed per-user through
--     the reauth-gated, fail-closed-audited detail endpoint (B-063).
-- Idempotent; forward-only; safe to re-run.

-- ============================================================================
-- 1) AI usage / cost ledger (B-061)
-- ============================================================================
create table if not exists public.ai_usage (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  user_id        uuid references auth.users(id) on delete set null,
  ip_hash        text,
  feature        text not null,
  provider       text not null,
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  latency_ms     integer,
  status         text not null check (status in ('ok','error','timeout','blocked')),
  error_code     text,
  cost_usd       numeric(10,6),
  prompt_version text,
  content_hash   text,
  constraint ai_usage_feature_bounded check (length(feature) <= 80),
  constraint ai_usage_provider_bounded check (length(provider) <= 80)
);
create index if not exists ai_usage_user_day   on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_feature_day on public.ai_usage (feature, created_at desc);
create index if not exists ai_usage_day        on public.ai_usage (created_at desc);
-- Partial index backing the anonymous per-IP daily budget (B-073).
create index if not exists ai_usage_ip_day
  on public.ai_usage (ip_hash, created_at desc)
  where ip_hash is not null;

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
-- No policies: server-only (service role). Retention target: 12 months (§25);
-- the retention job is Phase 12 (B-352) — documented, not silently dropped.

-- ============================================================================
-- 2) audit_logs extension (B-060): outcome + correlation + hashed client ids
-- ============================================================================
alter table public.audit_logs add column if not exists outcome    text;
alter table public.audit_logs add column if not exists request_id uuid;
alter table public.audit_logs add column if not exists ip_hash    text;
alter table public.audit_logs add column if not exists ua_hash    text;
create index if not exists audit_logs_user_day on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_ip_day   on public.audit_logs (ip_hash, created_at desc);

-- ============================================================================
-- 3) PII-safe admin list view (B-063): email domain instead of email.
--    DROP + CREATE (not OR REPLACE): postgres cannot rename a view column
--    in place, and the email column is being replaced by email_domain.
-- ============================================================================
drop view if exists public.admin_user_overview;
create view public.admin_user_overview as
select
  p.user_id,
  split_part(p.email, '@', 2) as email_domain,
  p.full_name,
  p.account_status,
  coalesce(s.plan, 'FREE') as plan,
  coalesce(ar.risk_score, 0) as risk_score,
  p.created_at
from public.profiles p
left join public.subscriptions s on s.user_id = p.user_id
left join lateral (
  select max(risk_score) as risk_score
  from public.account_relationships
  where user_a = p.user_id or user_b = p.user_id
) ar on true;

alter view public.admin_user_overview set (security_invoker = on);
revoke select on public.admin_user_overview from anon, authenticated;
