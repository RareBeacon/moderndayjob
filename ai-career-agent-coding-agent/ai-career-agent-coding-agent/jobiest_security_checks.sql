-- jobiest_security_checks.sql
-- Extracted VERBATIM from the Master Implementation Package, Book IV
-- (JOBIEST_MASTER_IMPLEMENTATION_PACKAGE.md, 2026-09-16).
--
-- Run read-only in the Supabase SQL editor against PRODUCTION, then staging,
-- then wire into CI against the shadow database (Book III B-002 / B-020).
-- Every query has an EXPECTED result in its comments; anything else is a finding.
--
-- ============================================================================
-- JOBIEST SECURITY CHECKS  —  v1.0  —  2026-09-16
-- Companion to JOBIEST_IMPLEMENTATION_SPEC.md (Appendix D)
--
-- PURPOSE   Prove (not assume) that database-level authorization is correct.
-- SAFETY    Read-only. D1–D11 only SELECT from system catalogs and views.
--           Safe to run in production, in the Supabase SQL editor.
-- USAGE     Run D1–D11 and read the flags in the comments: every query has an
--           EXPECTED result. Anything else is a finding — record it, then fix
--           it in a migration (template at the bottom), then re-run.
-- CADENCE   (1) immediately, read-only, in production
--           (2) in CI against a shadow database on every migration
--           (3) nightly in production, with an alert on policy drift
-- ============================================================================

-- ---------------------------------------------------------------------------
-- D1. TABLES WITHOUT ROW LEVEL SECURITY  (the single most important query)
-- ---------------------------------------------------------------------------
select n.nspname as schema, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('public','storage')
  and c.relrowsecurity = false
order by 1,2;
-- EXPECTED: zero rows.
-- Any row here on a table reachable with the publishable key = candidate PII exposed.

-- ---------------------------------------------------------------------------
-- D2. PERMISSIVE POLICIES (allow-everything)
-- ---------------------------------------------------------------------------
select schemaname, tablename, policyname, cmd,
       coalesce(qual,'') as using_expr, coalesce(with_check,'') as check_expr
from pg_policies
where schemaname in ('public','storage')
  and (qual in ('true','(true)') or with_check in ('true','(true)'))
order by 1,2;
-- EXPECTED: only tables you have deliberately decided are world-readable
-- (reference data / curated public views). Keep that list in
-- REVIEWED_PUBLIC_READ_TABLES in CI so drift is visible in code review.

-- ---------------------------------------------------------------------------
-- D3. USER-OWNED TABLES WITH POLICIES THAT DO NOT REFERENCE auth.uid()
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','documents','applications','agent_runs',
                    'subscriptions','usage_counters','entitlements')
  and cmd <> 'INSERT'
  and coalesce(qual,'') not ilike '%auth.uid()%'
order by 1,2;
-- EXPECTED: zero rows (document any intentional admin-only policy).

-- ---------------------------------------------------------------------------
-- D4. INSERT POLICIES MISSING A WITH CHECK
-- ---------------------------------------------------------------------------
select tablename, policyname
from pg_policies
where schemaname = 'public' and cmd = 'INSERT' and with_check is null;
-- EXPECTED: zero rows. Without WITH CHECK a user can insert rows owned by someone else.

-- ---------------------------------------------------------------------------
-- D5. anon GRANTS ON TABLES (any public-table grant to anon is a finding)
-- ---------------------------------------------------------------------------
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema in ('public','storage')
order by 1,2,3;
-- EXPECTED: only genuinely public data (e.g. a curated public jobs view).
-- RLS is the row gate, but grants determine whether the table is reachable at all.

-- ---------------------------------------------------------------------------
-- D6. SECURITY DEFINER FUNCTIONS IN public WITHOUT A PINNED search_path
-- ---------------------------------------------------------------------------
select n.nspname as schema, p.proname as function_name,
       coalesce(array_to_string(p.proconfig, ','), '(none)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and (p.proconfig is null
       or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
-- EXPECTED: zero rows. These are privilege-escalation primitives.

-- ---------------------------------------------------------------------------
-- D7. RLS ENABLED BUT NO POLICIES (fail-closed — verify the intent)
-- ---------------------------------------------------------------------------
select n.nspname as schema, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname = 'public' and c.relrowsecurity = true
  and not exists (select 1 from pg_policies p
                  where p.schemaname = n.nspname and p.tablename = c.relname)
order by 1,2;
-- EXPECTED: exactly the server-only tables (audit_events, ai_usage, webhook_events,
-- usage_counters, subscriptions, agent_credentials, application_events ...).
-- A user-facing table listed here cannot be read by its own owner (app bug).
-- A server-only table NOT listed here (i.e. it has policies) deserves scrutiny.

-- ---------------------------------------------------------------------------
-- D8. SEQUENCE PRIVILEGES HELD BY anon
-- ---------------------------------------------------------------------------
select sequence_schema, sequence_name, privilege_type
from information_schema.role_usage_grants
where grantee = 'anon' and sequence_schema = 'public';
-- EXPECTED: zero rows.

-- ---------------------------------------------------------------------------
-- D9. STORAGE BUCKETS: visibility, limits, policies
-- ---------------------------------------------------------------------------
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by name;
-- EXPECTED: CV/document/screenshot buckets public = false.

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
order by 1;
-- EXPECTED: policies scoped to the owning user's prefix, one per needed command.

-- ---------------------------------------------------------------------------
-- D10. QUERY HYGIENE: tables with heavy sequential scans (missing indexes /
--      unbounded queries). High seq_scan on a large table is a smell.
-- ---------------------------------------------------------------------------
select relname as table_name, seq_scan, idx_scan, n_live_tup
from pg_stat_user_tables
where schemaname = 'public' and n_live_tup > 10000
order by seq_scan desc
limit 20;

-- D10b. Missing indexes on foreign keys (common source of slow, unbounded scans)
select tc.table_name, kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  and not exists (
    select 1 from pg_indexes i
    where i.schemaname = 'public' and i.tablename = tc.table_name
      and i.indexdef ilike '%' || kcu.column_name || '%'
  )
order by 1,2;

-- ---------------------------------------------------------------------------
-- D11. LONG-RUNNING / UNBOUNDED QUERIES CURRENTLY ACTIVE
-- ---------------------------------------------------------------------------
select pid,
       now() - query_start as duration,
       state,
       left(query, 140) as query
from pg_stat_activity
where state <> 'idle'
  and now() - query_start > interval '5 seconds'
order by duration desc;

-- ---------------------------------------------------------------------------
-- D12. AUDIT-INTEGRITY ASSERTIONS (skip if the tables do not exist yet)
-- ---------------------------------------------------------------------------
-- Prove that audit history cannot be edited from an application session:
--   set role authenticated;
--   update public.audit_events set outcome = 'allow' where id = 1;   -- must raise
--   delete from public.audit_events where id = 1;                    -- must raise
--   reset role;
select table_name,
       case when privilege_type = 'UPDATE' then 'REVIEW'
            when privilege_type = 'DELETE' then 'REVIEW'
            else privilege_type end as privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('audit_events','application_events','webhook_events')
  and grantee in ('anon','authenticated','public')
order by 1,2;
-- EXPECTED: no UPDATE/DELETE grants to anon/authenticated/public on these tables.

-- ============================================================================
-- FIX TEMPLATE — apply deliberately, one table at a time, inside a migration.
-- Do NOT run this block as-is: replace <t> and confirm the ownership column.
-- ============================================================================
-- alter table public.<t> enable row level security;
-- alter table public.<t> force  row level security;
--
-- create policy <t>_select_own on public.<t>
--   for select using (user_id = (select auth.uid()));
-- create policy <t>_insert_own on public.<t>
--   for insert with check (user_id = (select auth.uid()));
-- create policy <t>_update_own on public.<t>
--   for update using (user_id = (select auth.uid()))
--               with check (user_id = (select auth.uid()));
-- create policy <t>_delete_own on public.<t>
--   for delete using (user_id = (select auth.uid()));
--
-- revoke all on public.<t> from anon;
--
-- Verification after applying: re-run D1–D7 and confirm zero unexpected rows,
-- then run the two-user IDOR integration test before deploying.
-- ============================================================================
