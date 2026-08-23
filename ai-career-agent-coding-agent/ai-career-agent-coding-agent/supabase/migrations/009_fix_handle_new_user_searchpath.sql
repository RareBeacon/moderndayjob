-- 009_fix_handle_new_user_searchpath.sql
-- Fix: the handle_new_user() SECURITY DEFINER trigger had no `search_path` set
-- and used unqualified table names. When GoTrue's auth connection invoked it,
-- table resolution failed and EVERY signup returned
-- "Database error saving new user" (HTTP 500).
--
-- Fix per Supabase best practice: pin `search_path = public` and qualify every
-- table with the `public.` schema so resolution is unambiguous regardless of
-- the caller's search_path. Applied to prod; idempotent (CREATE OR REPLACE).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare wid uuid;
begin
  insert into public.workspaces(name)
    values(coalesce(new.raw_user_meta_data->>'full_name','My Workspace')) returning id into wid;
  insert into public.profiles(user_id, workspace_id, full_name, email)
    values(new.id, wid, new.raw_user_meta_data->>'full_name', new.email);
  insert into public.workspace_members(workspace_id, user_id, role)
    values(wid, new.id, 'OWNER');
  insert into public.subscriptions(user_id, plan, status, trial_started_at, trial_ends_at)
    values(new.id, 'FREE', 'TRIAL', now(), now() + interval '7 days');
  return new;
end $$;
comment on function public.handle_new_user() is 'Provisions workspace/profile/membership/subscription on signup. search_path pinned (see migration 009).';
