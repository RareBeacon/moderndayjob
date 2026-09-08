-- 010_lockdown_private_tables.sql
-- Security hardening (discovered during the Supabase project migration):
-- the original schema enabled RLS on only a subset of tables. The rest were
-- readable by the public `anon` key, and the two views bypass RLS by default,
-- leaking every user's email/plan/entitlements/trial dates to anonymous API
-- callers. The app reads/writes everything through the service role, so
-- locking these to service-role (RLS default-deny) breaks nothing.

-- 1) Enable RLS on every remaining table.
alter table public.workspaces enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.ai_credentials enable row level security;
alter table public.security_events enable row level security;
alter table public.account_relationships enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_actions enable row level security;

-- 2) Owner read-only access where a user_id column exists (matches the
--    existing owner-read pattern). Everything else stays service-role-only.
drop policy if exists subscriptions_self on public.subscriptions;
create policy subscriptions_self on public.subscriptions for select using (auth.uid() = user_id);

drop policy if exists payments_self on public.payments;
create policy payments_self on public.payments for select using (auth.uid() = user_id);

drop policy if exists ai_credentials_self on public.ai_credentials;
create policy ai_credentials_self on public.ai_credentials for select using (auth.uid() = user_id);

drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read on public.workspaces for select
  using (exists (select 1 from public.workspace_members wm
                 where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()));

-- 3) Views: run with the caller's privileges so RLS applies, and remove them
--    from the anonymous/authenticated API surface entirely.
alter view public.v_workspace_entitlements set (security_invoker = on);
alter view public.admin_user_overview set (security_invoker = on);
revoke select on public.v_workspace_entitlements from anon, authenticated;
revoke select on public.admin_user_overview from anon, authenticated;

-- 4) Support/admin tables have no business in the anonymous API at all.
revoke select, insert, update, delete on public.admin_users from anon, authenticated;
revoke select, insert, update, delete on public.admin_actions from anon, authenticated;
revoke select, insert, update, delete on public.payment_events from anon, authenticated;
revoke select, insert, update, delete on public.security_events from anon, authenticated;
revoke select, insert, update, delete on public.account_relationships from anon, authenticated;
