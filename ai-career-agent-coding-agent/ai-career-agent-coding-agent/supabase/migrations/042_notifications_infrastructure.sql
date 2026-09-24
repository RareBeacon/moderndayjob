-- 042_notifications_infrastructure.sql
--
-- Backend for the mobile app's notification endpoints (moved into the app
-- 2026-09-24; the original PR placed them outside the Next.js app root, so
-- they never deployed). Two pieces were missing in the database:
--
-- 1) notifications: per-user in-app notification history (the bell), written
--    by sendPushNotification and read by GET /api/notifications. RLS on,
--    user-scoped policies only: a user sees and manages their own rows and
--    nothing else. No public/anon access.
-- 2) profiles.device_tokens / profiles.notification_preferences: JSON
--    columns used by lib/push-notifications.ts and the preferences route.
--    Before this migration those routes silently no-oped (wrong column and
--    a missing table), and the list route returned fabricated samples,
--    which has been removed from the code.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  deep_link text,
  type text not null default 'general',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own" on public.notifications
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.profiles add column if not exists device_tokens jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists notification_preferences jsonb;
