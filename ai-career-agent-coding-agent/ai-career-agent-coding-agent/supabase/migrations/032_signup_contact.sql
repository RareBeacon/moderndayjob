-- 032_signup_contact.sql
--
-- Registration now collects the user's full name and phone number
-- (owner brief 2026-09-21: signup form upgrade, Nigeria +234 default).
-- profiles gains a phone column; handle_new_user copies it from the signup
-- metadata the API route stores on the auth user (raw_user_meta_data), the
-- same mechanism already used for full_name. Idempotent; RLS unchanged
-- (existing profiles row policies cover the new column automatically).

alter table public.profiles add column if not exists phone text;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = 'public' as $$
declare wid uuid;
begin
  insert into public.workspaces(name)
    values(coalesce(new.raw_user_meta_data->>'full_name','My Workspace')) returning id into wid;
  insert into public.profiles(user_id, workspace_id, full_name, email, phone)
    values(new.id, wid, new.raw_user_meta_data->>'full_name', new.email, nullif(new.raw_user_meta_data->>'phone',''));
  insert into public.workspace_members(workspace_id, user_id, role)
    values(wid, new.id, 'OWNER');
  insert into public.subscriptions(user_id, plan, status, trial_started_at, trial_ends_at)
    values(new.id, 'FREE', 'TRIAL', now(), now() + interval '7 days');
  return new;
end $$;
