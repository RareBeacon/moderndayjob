-- 025_google_email_verification.sql
-- Google OAuth (Phase: google sign-in) email verification gate.
--
-- Product decision (user requirement, 2026-09-16): accounts created via
-- "Continue with Google" must verify their email address with a 6-digit
-- code before they can use the product. Password accounts keep the
-- existing instant-access policy (pre-confirmed at signup); the gate
-- applies only to google-linked sessions.
--
-- The column is per-profile; existing accounts are backfilled as verified
-- (they predate the gate or were confirmed at signup). New google users
-- start NULL and are gated by the app until they enter a valid code.

alter table public.profiles
  add column if not exists email_verified_at timestamptz;

-- One active (unconsumed) code per user; hashed at rest, service-role only.
create table if not exists public.email_verification_codes(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_codes_user_idx
  on public.email_verification_codes(user_id);

alter table public.email_verification_codes enable row level security;
-- Deliberately no policies: service-role access only (mirrors the
-- ai_credentials lockdown pattern; no client can read or write codes).

-- Backfill: every account that exists today counts as verified.
update public.profiles
  set email_verified_at = created_at
  where email_verified_at is null;
