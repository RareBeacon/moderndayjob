-- 026_welcome_email_and_support.sql
-- Welcome-email idempotency + support intake.
--
-- profiles.welcome_email_sent_at: set-once marker so the welcome email can
-- only ever be sent once per account, no matter how often verification is
-- replayed or pages refreshed (server-side single-writer semantics).
alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;

-- Support messages: every contact form submission is stored (audit + queue);
-- delivery to the support inbox happens via the transactional email system.
create table if not exists public.support_messages(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  category text not null,
  subject text not null,
  message text not null,
  ip_hash text,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_created_idx on public.support_messages(created_at desc);
alter table public.support_messages enable row level security;
-- No policies: service-role only (the API writes; the owner reads).

-- Tiny server-side config store (support inbox destination, etc.).
-- Service-role only; values never appear in the client bundle.
create table if not exists public.app_config(
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
