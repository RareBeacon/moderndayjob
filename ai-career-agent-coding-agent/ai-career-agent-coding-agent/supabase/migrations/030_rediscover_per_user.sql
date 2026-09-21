-- 030_rediscover_per_user.sql
--
-- Owner decision (2026-09-21): job discovery is back, per-user. A paid user's
-- agent reads their preferences, finds matching roles on the public boards in
-- the job_sources registry, and adds them to that user's pipeline (private
-- jobs rows, never a shared pool; the public job browser stays retired).
--
-- This migration:
--   1. job_preferences.discovered_at: per-user discovery cooldown stamp
--      (skip a user whose agent already ran within the last ~20 hours).
--   2. Seeds eight more employer boards into job_sources. Every token below
--      was verified live (public board API returned postings) on 2026-09-21:
--      stripe 665, databricks 875, cloudflare 379, brex 251, airbnb 168,
--      pinterest 161, figma 152, asana 103. Only Greenhouse/Lever boards are
--      seeded: those are the boards the autopilot can actually submit to.
--
-- Idempotent; RLS posture unchanged.

-- 1) Discovery cooldown stamp -------------------------------------------------
alter table public.job_preferences
  add column if not exists discovered_at timestamptz;

comment on column public.job_preferences.discovered_at is 'Last time the discovery agent ran for this user; a cooldown prevents duplicate runs within a day.';

-- 2) Verified employer boards (compliance metadata mirrors migration 024) ----
insert into public.job_sources (id, adapter, board, compliance) values
  ('greenhouse:stripe', 'greenhouse', 'stripe',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-21","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:databricks', 'greenhouse', 'databricks',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-21","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:cloudflare', 'greenhouse', 'cloudflare',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-21","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:brex', 'greenhouse', 'brex',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-21","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:airbnb', 'greenhouse', 'airbnb',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-21","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:pinterest', 'greenhouse', 'pinterest',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-21","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:figma', 'greenhouse', 'figma',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-21","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb),
  ('greenhouse:asana', 'greenhouse', 'asana',
   '{"transport":"public board API","termsUrl":"https://www.greenhouse.io/legal","termsReviewedAt":"2026-09-21","attribution":"Listing data from the employer public Greenhouse board"}'::jsonb)
on conflict (id) do nothing;
