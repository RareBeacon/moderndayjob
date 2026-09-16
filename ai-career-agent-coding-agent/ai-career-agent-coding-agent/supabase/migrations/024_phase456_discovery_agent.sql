-- 024_phase456_discovery_agent.sql, Phase 4/5/6 (B-140/B-144/B-145/B-147/B-181)
--
-- Phase 4 (job discovery):
--   * job_sources registry with compliance metadata and per-source kill
--     switch + circuit-breaker counters (B-140/B-147/B-224 per-source).
--   * jobs.last_seen_at (freshness, B-145), content_hash + duplicate_key
--     (cross-source dedup tier 2, B-144). Tier 1 (source, external_id)
--     already exists as a unique constraint.
-- Phase 5 (application agent):
--   * applications.approved_at + approval_snapshot (B-181: approval bound to
--     the exact payload it approved; edits invalidate; single-use via the
--     state machine; 24h window enforced in the auto-submit gate).
-- Idempotent; RLS enabled with no policies (service-role only), same
-- migration, per the §8.2 rule 8.

-- ============================================================================
-- 1) Job source registry (B-140/B-147)
-- ============================================================================
create table if not exists public.job_sources (
  id                   text primary key,           -- e.g. 'greenhouse:gitlab'
  adapter              text not null,              -- 'greenhouse' | 'lever' | 'ashby'
  board                text not null,              -- board token / org handle
  enabled              boolean not null default true,  -- per-source kill switch
  compliance           jsonb not null default '{}'::jsonb, -- termsUrl, termsReviewedAt, attribution, transport
  consecutive_failures integer not null default 0,
  last_ok_at           timestamptz,
  cooldown_until       timestamptz,                -- circuit open until this moment
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint job_sources_adapter_values check (adapter in ('greenhouse','lever','ashby'))
);
alter table public.job_sources enable row level security;
revoke all on public.job_sources from anon, authenticated;
create index if not exists job_sources_enabled on public.job_sources (enabled) where enabled;

-- ============================================================================
-- 2) Jobs: freshness + cross-source dedup (B-144/B-145)
-- ============================================================================
alter table public.jobs add column if not exists last_seen_at timestamptz not null default now();
alter table public.jobs add column if not exists content_hash text;
alter table public.jobs add column if not exists duplicate_key text;
create index if not exists jobs_duplicate_key on public.jobs (duplicate_key) where duplicate_key is not null;
create index if not exists jobs_last_seen on public.jobs (last_seen_at desc);

-- ============================================================================
-- 3) Applications: approval snapshot (B-181)
-- ============================================================================
alter table public.applications add column if not exists approved_at timestamptz;
alter table public.applications add column if not exists approval_snapshot jsonb;

-- ============================================================================
-- 4) Seed the registry from the boards the pipeline already uses
-- ============================================================================
insert into public.job_sources (id, adapter, board, compliance) values
  ('greenhouse:gitlab', 'greenhouse', 'gitlab',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-16","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:anthropic', 'greenhouse', 'anthropic',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-16","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:coinbase', 'greenhouse', 'coinbase',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-16","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('lever:spotify', 'lever', 'spotify',
   '{"transport":"public board API","termsUrl":"https://www.lever.co/legal","termsReviewedAt":"2026-09-16","attribution":"Listing data from the employer public Lever board"}'::jsonb),
  ('ashby:openai', 'ashby', 'openai',
   '{"transport":"public board API","termsUrl":"https://www.ashbyhq.com/legal","termsReviewedAt":"2026-09-16","attribution":"Listing data from the employer public Ashby board"}'::jsonb),
  ('ashby:linear', 'ashby', 'linear',
   '{"transport":"public board API","termsUrl":"https://www.ashbyhq.com/legal","termsReviewedAt":"2026-09-16","attribution":"Listing data from the employer public Ashby board"}'::jsonb)
on conflict (id) do nothing;
