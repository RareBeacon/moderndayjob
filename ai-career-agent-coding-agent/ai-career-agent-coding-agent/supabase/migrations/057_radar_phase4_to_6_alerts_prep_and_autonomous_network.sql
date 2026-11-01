-- ============================================================================
-- Migration 057: Radar Phases 4-6 - Assisted Prep, Candidate Alerts & Autonomous Promotion
-- ============================================================================
-- Completes the 6-Stage Global Employment Intelligence Network:
--   - Stage 4/5: Candidate First-Mover Alert Subscriptions + Deduplicated Delivery Ledger
--   - Stage 6: Safe External Form & Assisted Application Preparation Packs
--              (Mandatory human approval enforced via SQL CHECK constraint)
--   - Autonomous Network Expansion: Validated Public ATS Candidate Promotion RPC
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- 1. Candidate First-Mover Radar Alert Subscriptions (owner-scoped RLS)
create table if not exists public.radar_candidate_alerts (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  enabled             boolean not null default true,
  exclusivity_only    boolean not null default false,
  min_confidence      smallint not null default 75 check (min_confidence >= 50 and min_confidence <= 100),
  workplace_types     text[] not null default '{}',
  target_roles        text[] not null default '{}',
  country_codes       text[] not null default '{}',
  frequency           text not null default 'DAILY' check (frequency in ('DAILY', 'INSTANT', 'PAUSED')),
  email_enabled       boolean not null default false,
  last_notified_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.radar_candidate_alerts enable row level security;

drop policy if exists radar_candidate_alerts_owner_select on public.radar_candidate_alerts;
create policy radar_candidate_alerts_owner_select
  on public.radar_candidate_alerts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists radar_candidate_alerts_owner_insert on public.radar_candidate_alerts;
create policy radar_candidate_alerts_owner_insert
  on public.radar_candidate_alerts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists radar_candidate_alerts_owner_update on public.radar_candidate_alerts;
create policy radar_candidate_alerts_owner_update
  on public.radar_candidate_alerts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists radar_candidate_alerts_owner_delete on public.radar_candidate_alerts;
create policy radar_candidate_alerts_owner_delete
  on public.radar_candidate_alerts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.radar_candidate_alerts from anon;

-- 2. Deduplicated Candidate Alert Delivery Ledger (internal service_role only)
create table if not exists public.radar_alert_deliveries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  radar_job_id    uuid not null references public.radar_jobs(id) on delete cascade,
  channel         text not null default 'IN_APP' check (channel in ('IN_APP', 'IN_APP_AND_EMAIL')),
  match_score     smallint not null default 0 check (match_score >= 0 and match_score <= 100),
  delivered_at    timestamptz not null default now(),
  unique (user_id, radar_job_id)
);

create index if not exists radar_alert_deliveries_user_idx
  on public.radar_alert_deliveries (user_id, delivered_at desc);

alter table public.radar_alert_deliveries enable row level security;
revoke all on public.radar_alert_deliveries from anon, authenticated;

-- 3. Assisted Application Preparation Packs (Stage 6: Mandatory Human Approval)
create table if not exists public.radar_assisted_preparations (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  radar_job_id            uuid not null references public.radar_jobs(id) on delete cascade,
  application_form_id     uuid references public.radar_application_forms(id) on delete set null,
  apply_url               text not null,
  apply_mechanism         text not null,
  tailored_pitch          text not null default '',
  draft_answers           jsonb not null default '[]'::jsonb,
  safety_notes            text[] not null default '{}',
  requires_human_review   boolean not null default true check (requires_human_review = true),
  status                  text not null default 'DRAFT_FOR_HUMAN_REVIEW' check (
    status in ('DRAFT_FOR_HUMAN_REVIEW', 'APPROVED_BY_USER', 'ARCHIVED')
  ),
  human_approved_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, radar_job_id),
  constraint radar_assisted_prep_human_approval_ts_chk check (
    status <> 'APPROVED_BY_USER' or human_approved_at is not null
  )
);

create index if not exists radar_assisted_preparations_user_idx
  on public.radar_assisted_preparations (user_id, updated_at desc);

alter table public.radar_assisted_preparations enable row level security;

drop policy if exists radar_assisted_preparations_owner_select on public.radar_assisted_preparations;
create policy radar_assisted_preparations_owner_select
  on public.radar_assisted_preparations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists radar_assisted_preparations_owner_insert on public.radar_assisted_preparations;
create policy radar_assisted_preparations_owner_insert
  on public.radar_assisted_preparations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and requires_human_review = true);

drop policy if exists radar_assisted_preparations_owner_update on public.radar_assisted_preparations;
create policy radar_assisted_preparations_owner_update
  on public.radar_assisted_preparations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and requires_human_review = true);

revoke all on public.radar_assisted_preparations from anon;

-- 4. Safe Validated Public ATS Candidate Promotion RPC (service_role only)
-- Only promotes queued candidates whose provider has EXPLICIT_PUBLIC_EMBED_API +
-- commercial_indexing_allowed = true AND zero matches in radar_exclusions.
create or replace function public.promote_validated_radar_candidates(
  p_limit integer default 15
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cand record;
  v_source_id text;
  v_promoted integer := 0;
begin
  for v_cand in
    select
      c.id,
      c.discovered_url,
      c.normalized_host,
      lower(trim(c.detected_provider)) as provider_key,
      trim(c.detected_board_token) as board_token,
      c.discovery_channel,
      p.default_poll_interval_minutes
    from public.radar_source_candidates c
    inner join public.radar_provider_policies p
      on p.provider_key = lower(trim(c.detected_provider))
    where c.review_status = 'QUEUED_VALIDATION'
      and c.detected_provider is not null
      and c.detected_board_token is not null
      and trim(c.detected_board_token) ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$'
      and lower(trim(c.detected_provider)) in (
        'greenhouse',
        'lever',
        'lever_eu',
        'ashby',
        'workable',
        'recruitee',
        'personio',
        'pinpoint',
        'gem',
        'polymer',
        'breezy',
        'teamtailor'
      )
      and p.collection_permission = 'EXPLICIT_PUBLIC_EMBED_API'
      and p.commercial_indexing_allowed = true
      and not exists (
        select 1
        from public.radar_exclusions ex
        where ex.active = true
          and (
            (ex.pattern_type = 'DOMAIN' and (
              lower(c.normalized_host) = lower(ex.pattern_value)
              or lower(c.normalized_host) like '%.' || lower(ex.pattern_value)
              or (c.employer_domain_hint is not null and lower(c.employer_domain_hint) = lower(ex.pattern_value))
            ))
            or (ex.pattern_type = 'URL_PREFIX' and lower(c.discovered_url) like lower(ex.pattern_value) || '%')
            or (ex.pattern_type = 'ATS_BOARD' and lower(ex.pattern_value) = lower(trim(c.detected_provider)) || ':' || lower(trim(c.detected_board_token)))
          )
      )
    order by c.first_seen_at asc
    limit least(greatest(p_limit, 1), 50)
  loop
    v_source_id := v_cand.provider_key || ':' || lower(v_cand.board_token);

    insert into public.job_sources (
      id,
      adapter,
      board,
      enabled,
      provider_policy_key,
      source_url,
      collection_permission,
      commercial_indexing_allowed,
      poll_interval_minutes,
      robots_status,
      priority,
      trust_level,
      discovered_via,
      compliance
    )
    values (
      v_source_id,
      v_cand.provider_key,
      lower(v_cand.board_token),
      true,
      v_cand.provider_key,
      v_cand.discovered_url,
      'EXPLICIT_PUBLIC_EMBED_API',
      true,
      coalesce(v_cand.default_poll_interval_minutes, 240),
      'NOT_APPLICABLE_EMBED_API',
      60,
      78,
      v_cand.discovery_channel,
      jsonb_build_object(
        'auto_promoted_at', now(),
        'policy_permission', 'EXPLICIT_PUBLIC_EMBED_API'
      )
    )
    on conflict (id) do nothing;

    update public.radar_source_candidates
       set review_status = 'PROMOTED_TO_SOURCE',
           promoted_source_id = v_source_id,
           evaluated_at = now()
     where id = v_cand.id;

    v_promoted := v_promoted + 1;
  end loop;

  return v_promoted;
end;
$$;

revoke all on function public.promote_validated_radar_candidates(integer) from public, anon, authenticated;
grant execute on function public.promote_validated_radar_candidates(integer) to service_role;

-- 5. Extend Intelligence Summary RPC with Phase 4-6 Network Metrics
create or replace function public.get_radar_intelligence_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_summary jsonb;
begin
  select jsonb_build_object(
    'total_active_jobs', (
      select count(*) from public.radar_jobs where lifecycle_status = 'ACTIVE'
    ),
    'potentially_closing_jobs', (
      select count(*) from public.radar_jobs where lifecycle_status = 'POTENTIALLY_CLOSING'
    ),
    'first_party_exclusive_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'FIRST_PARTY_EXCLUSIVE'
    ),
    'first_mover_exclusive_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'FIRST_MOVER_EXCLUSIVE'
    ),
    'early_direct_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'EARLY_DIRECT'
    ),
    'syndicated_count', (
      select count(*) from public.radar_jobs
      where lifecycle_status = 'ACTIVE' and exclusivity_tier = 'SYNDICATED'
    ),
    'avg_lead_time_hours', (
      select round(avg(lead_time_hours)::numeric, 2)
      from public.radar_jobs
      where lead_time_hours is not null and lead_time_hours > 0
    ),
    'verified_employers_count', (
      select count(*) from public.radar_employers
      where employer_verification_status in ('EVIDENCE_VERIFIED', 'FIRST_PARTY_VERIFIED')
    ),
    'pending_source_candidates_count', (
      select count(*) from public.radar_source_candidates where review_status = 'QUEUED_VALIDATION'
    ),
    'scams_rejected_count', (
      select count(*) from public.radar_jobs
      where verification_status in ('SCAM_REJECTED', 'SUSPICIOUS_QUARANTINE')
    ),
    'active_exclusions_count', (
      select count(*) from public.radar_exclusions where active = true
    ),
    'inspected_forms_count', (
      select count(*) from public.radar_application_forms
    ),
    'assisted_preparations_count', (
      select count(*) from public.radar_assisted_preparations
    ),
    'active_alert_subscribers_count', (
      select count(*) from public.radar_candidate_alerts where enabled = true and frequency <> 'PAUSED'
    )
  ) into v_summary;

  return v_summary;
end;
$$;

revoke all on function public.get_radar_intelligence_summary() from public, anon, authenticated;
grant execute on function public.get_radar_intelligence_summary() to service_role;
