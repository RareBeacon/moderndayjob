-- =============================================================================
-- Migration 052: Cybersecurity, User Data & Admin Panel Hardening
-- =============================================================================
-- Security invariants enforced:
--   1. Lock down `public.ai_credentials` against direct PostgREST client reads:
--      migration 010 left `ai_credentials_self` (`for select using (auth.uid() = user_id)`),
--      which exposed `ciphertext` and full `base_url` directly to user JWTs if
--      exfiltrated via XSS or token theft. Dropping `ai_credentials_self` while
--      keeping RLS enabled (zero client policies) causes PostgREST to return
--      `200 []` (0 rows) to both `anon` and `authenticated` (preserving the
--      daily `self-scan` contract while completely blocking ciphertext reads).
--      All legitimate reads/writes run server-side via `/api/credentials` and
--      `/api/admin/credentials` using `service_role`, stripping `ciphertext`.
--   2. Enforce database-level `http(s)://` scheme check on
--      `public.employer_organizations.website_url` (`NOT VALID` for safe online
--      rollout without locking existing rows) so `javascript:` / `data:` URLs
--      cannot be persisted even if an upstream caller bypasses Zod validation.
--   3. Re-assert RLS + write revocations on `admin_users`, `admin_actions`,
--      `audit_logs`, and `security_events` (idempotent defense-in-depth).
-- =============================================================================

alter table if exists public.ai_credentials enable row level security;
drop policy if exists ai_credentials_self on public.ai_credentials;
revoke insert, update, delete on public.ai_credentials from anon, authenticated;

alter table if exists public.admin_users enable row level security;
revoke select, insert, update, delete on public.admin_users from anon, authenticated;

alter table if exists public.admin_actions enable row level security;
revoke select, insert, update, delete on public.admin_actions from anon, authenticated;

alter table if exists public.audit_logs enable row level security;
revoke insert, update, delete on public.audit_logs from anon, authenticated;

alter table if exists public.security_events enable row level security;
revoke select, insert, update, delete on public.security_events from anon, authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'employer_organizations'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'employer_organizations_website_url_http_chk'
  ) then
    alter table public.employer_organizations
      add constraint employer_organizations_website_url_http_chk
      check (website_url ~* '^https?://[^\s/$.?#].[^\s]*$') not valid;
  end if;
end $$;
