-- 044_app_sessions — Application-managed session registry for 30m idle / 7d absolute
-- Supports Supabase Free plan where native session lifetime controls are unavailable (Pro+ only)
-- Each login creates one opaque app session; browser gets session-only cookie with token hash stored.

-- Enable pgcrypto for gen_random_uuid if not already
create extension if not exists "pgcrypto";

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  ip_address text,
  user_agent text
);

create index if not exists app_sessions_user_id_idx on public.app_sessions (user_id);
create index if not exists app_sessions_token_hash_idx on public.app_sessions (token_hash);
create index if not exists app_sessions_last_active_idx on public.app_sessions (last_active_at);

alter table public.app_sessions enable row level security;

-- No policies for anon/authenticated — service_role bypasses RLS and is the only writer/reader.
-- This prevents users from reading/modifying arbitrary session records.

-- Helper to cleanup expired/revoked sessions older than 30 days (run via cron or manually)
-- delete from public.app_sessions where revoked_at < now() - interval '30 days' or expires_at < now() - interval '30 days';

comment on table public.app_sessions is 'App-managed sessions: 30m idle timeout, 7d absolute expiry. Opaque token hash stored, session-only cookie.';
