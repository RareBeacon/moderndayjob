-- 033_password_set_marker.sql
--
-- Honest "has a password" signal for the account-completion gate. The
-- gate previously read app_metadata.providers for 'email', but that list
-- is not updated when a password is set for a social account, so verified
-- users with a saved password were wrongly re-gated (2026-09-21 owner
-- report). profiles.password_set_at mirrors auth.users.encrypted_password
-- (the anon/RLS client cannot read the auth schema):
--   - set at insert by handle_new_user for password signups
--   - set by /api/auth/complete-account for social signups
--   - backfilled below for every existing user who already has a password.
-- Idempotent; RLS unchanged.

alter table public.profiles add column if not exists password_set_at timestamptz;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = 'public' as $$
declare wid uuid;
begin
  insert into public.workspaces(name)
    values(coalesce(new.raw_user_meta_data->>'full_name','My Workspace')) returning id into wid;
  insert into public.profiles(user_id, workspace_id, full_name, email, phone, password_set_at)
    values(new.id, wid, new.raw_user_meta_data->>'full_name', new.email,
           nullif(new.raw_user_meta_data->>'phone',''),
           case when new.encrypted_password is not null then now() else null end);
  insert into public.workspace_members(workspace_id, user_id, role)
    values(wid, new.id, 'OWNER');
  insert into public.subscriptions(user_id, plan, status, trial_started_at, trial_ends_at)
    values(new.id, 'FREE', 'TRIAL', now(), now() + interval '7 days');
  return new;
end $$;

-- Backfill: everyone who already has a password is marked as such.
update public.profiles p set password_set_at = now()
from auth.users u
where u.id = p.user_id and u.encrypted_password is not null and p.password_set_at is null;
