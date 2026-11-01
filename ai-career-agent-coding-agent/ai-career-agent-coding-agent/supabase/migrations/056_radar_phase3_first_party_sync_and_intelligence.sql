-- 056_radar_phase3_first_party_sync_and_intelligence.sql
-- Jobiest Global Opportunity Radar - Phase 3:
--   1. Register Phase 3 open intelligence providers (`hn_whoishiring`, `arbeitnow_api`,
--      `jobicy_api`) in `radar_provider_policies`.
--   2. Automatic First-Party Employer Portal -> Radar sync triggers & backfill
--      (`public.employer_organizations` + `public.recruitment_vacancies` ->
--       `public.radar_employers` + `public.radar_jobs` + deterministic evidence).
--   3. Employment Intelligence Network telemetry RPC (`get_radar_intelligence_summary`)
--      reporting First-Mover exclusivity, lead-time hours, source health, and
--      quarantined scam protections.
--
-- Security (Condition 2 & Condition 4):
--   - First-party certification ONLY triggers when `employer_organizations.verification_status = 'VERIFIED'`.
--   - Suspending or rejecting an organization immediately quarantines its Radar rows.
--   - All SECURITY DEFINER functions pin `set search_path = public, extensions`
--     and revoke execute from `public, anon, authenticated`.

create extension if not exists pgcrypto with schema extensions;

-- 1. Register Phase 3 open intelligence feeds & community signals in `radar_provider_policies`
insert into public.radar_provider_policies (
  provider_key,
  display_name,
  collection_permission,
  commercial_indexing_allowed,
  requires_robots_check,
  requires_attribution,
  attribution_template,
  terms_url,
  terms_reviewed_at,
  max_requests_per_minute,
  default_poll_interval_minutes,
  notes
)
values
  ('hn_whoishiring', 'Hacker News Who is Hiring (Algolia Public API)', 'OPEN_LICENSE_CC0_GOV', true, false, true,
   'Discovered via Hacker News Who is Hiring community thread', 'https://hn.algolia.com/api', '2026-11-01T00:00:00Z', 20, 360,
   'Used to discover direct employer ATS boards, career pages, external forms, and founder-posted roles.'),
  ('arbeitnow_api', 'Arbeitnow Public Job Board API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Syndicated feed attribution: Arbeitnow', 'https://www.arbeitnow.com/blog/job-board-api', '2026-11-01T00:00:00Z', 15, 360,
   'Keyless public JSON feed used with mandatory attribution and First-Mover lead-time benchmarking.'),
  ('jobicy_api', 'Jobicy Public Remote Jobs API', 'EXPLICIT_PUBLIC_EMBED_API', true, true, true,
   'Syndicated feed attribution: Jobicy', 'https://jobicy.com/jobs-rss-feed', '2026-11-01T00:00:00Z', 15, 360,
   'Keyless public remote jobs feed used with mandatory attribution and First-Mover lead-time benchmarking.')
on conflict (provider_key) do nothing;

-- Align `radar_exclusions.reason` and `job_sources_adapter_values` with Phase 3 admin & scout enums
alter table public.radar_exclusions drop constraint if exists radar_exclusions_reason_check;
alter table public.radar_exclusions
  add constraint radar_exclusions_reason_check check (
    reason in (
      'ROBOTS_DISALLOW',
      'ROBOTS_DISALLOWED',
      'TOS_RESTRICTED',
      'TERMS_OF_SERVICE_PROHIBITED',
      'EMPLOYER_OPT_OUT',
      'SCAM_CONFIRMED',
      'CONFIRMED_SCAM_DOMAIN',
      'LEGAL_TAKEDOWN',
      'ADMIN_BLOCK'
    )
  );

alter table public.job_sources drop constraint if exists job_sources_adapter_values;
alter table public.job_sources
  add constraint job_sources_adapter_values check (
    adapter in (
      'greenhouse',
      'lever',
      'lever_eu',
      'ashby',
      'workable',
      'smartrecruiters',
      'recruitee',
      'personio',
      'pinpoint',
      'gem',
      'polymer',
      'breezy',
      'teamtailor',
      'jsonld_career',
      'external_form',
      'public_feed',
      'hn_algolia',
      'hn_whoishiring',
      'arbeitnow_api',
      'jobicy_api'
    )
  );


-- 2. Core helper: sync one `recruitment_vacancies` row into `radar_employers` + `radar_jobs`
create or replace function public.sync_recruitment_vacancy_to_radar_by_id(
  p_vacancy_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_vac public.recruitment_vacancies%rowtype;
  v_org public.employer_organizations%rowtype;
  v_radar_employer_id uuid;
  v_radar_job_id uuid;
  v_workplace text;
  v_fingerprint text;
  v_cluster_key text;
  v_title_loc_hash text;
  v_content_hash text;
  v_apply_url text;
  v_desc text;
  v_domain text;
  v_evidence_hash text;
begin
  select * into v_vac
  from public.recruitment_vacancies
  where id = p_vacancy_id;

  if not found then
    return null;
  end if;

  select * into v_org
  from public.employer_organizations
  where id = v_vac.organization_id;

  if not found then
    return null;
  end if;

  -- Condition 2: Only admin-verified employer organizations may publish into Radar
  if v_org.verification_status <> 'VERIFIED' then
    update public.radar_jobs
       set lifecycle_status = 'QUARANTINED',
           closure_signal = 'FIRST_PARTY_CLOSED',
           updated_at = now()
     where recruitment_vacancy_id = v_vac.id
       and lifecycle_status in ('ACTIVE', 'POTENTIALLY_CLOSING');
    return null;
  end if;

  v_domain := nullif(lower(trim(v_org.business_email_domain)), '');

  -- Upsert canonical Radar employer bridged to `employer_organizations.id`
  insert into public.radar_employers (
    employer_organization_id,
    canonical_name,
    normalized_slug,
    primary_domain,
    website_url,
    careers_url,
    country_code,
    industry,
    discovery_origin,
    employer_verification_status,
    verified_by_deterministic_evidence,
    employer_legitimacy_score,
    last_verified_at,
    updated_at
  )
  values (
    v_org.id,
    v_org.company_name,
    'org-' || v_org.slug,
    v_domain,
    v_org.website_url,
    v_org.website_url,
    case
      when v_org.country is not null and char_length(trim(v_org.country)) = 2
        then upper(trim(v_org.country))
      else null
    end,
    v_org.industry,
    'FIRST_PARTY_PORTAL',
    'FIRST_PARTY_VERIFIED',
    true,
    96,
    coalesce(v_org.verified_at, now()),
    now()
  )
  on conflict (normalized_slug) do update
    set employer_organization_id = excluded.employer_organization_id,
        canonical_name = excluded.canonical_name,
        website_url = coalesce(excluded.website_url, public.radar_employers.website_url),
        careers_url = coalesce(excluded.careers_url, public.radar_employers.careers_url),
        employer_verification_status = 'FIRST_PARTY_VERIFIED',
        verified_by_deterministic_evidence = true,
        employer_legitimacy_score = greatest(public.radar_employers.employer_legitimacy_score, 96),
        last_verified_at = coalesce(v_org.verified_at, now()),
        updated_at = now()
  returning id into v_radar_employer_id;

  v_workplace := case
    when coalesce(v_vac.employment_preference, '') ilike '%remote%'
      or coalesce(v_vac.location, '') ilike '%remote%' then 'REMOTE'
    when coalesce(v_vac.employment_preference, '') ilike '%hybrid%'
      or coalesce(v_vac.location, '') ilike '%hybrid%' then 'HYBRID'
    when coalesce(v_vac.location, '') <> '' then 'ONSITE'
    else 'UNKNOWN'
  end;

  v_desc := coalesce(nullif(trim(v_vac.description), ''), v_vac.title || ' at ' || v_org.company_name);
  v_apply_url := 'https://jobiest.com/talent-pool?vacancy=' || v_vac.id::text;

  v_fingerprint := encode(
    extensions.digest('fp1:' || v_org.id::text || ':' || v_vac.id::text, 'sha256'),
    'hex'
  );
  v_cluster_key := substr(
    encode(
      extensions.digest('fpc:' || lower(trim(v_org.slug)) || ':' || lower(trim(v_vac.title)), 'sha256'),
      'hex'
    ),
    1,
    24
  );
  v_title_loc_hash := encode(
    extensions.digest(
      lower(trim(v_org.company_name)) || '|' || lower(trim(v_vac.title)) || '|' || coalesce(lower(trim(v_vac.location)), '') || '|' || v_workplace,
      'sha256'
    ),
    'hex'
  );
  v_content_hash := encode(extensions.digest(v_desc, 'sha256'), 'hex');

  if v_vac.status <> 'OPEN' then
    update public.radar_jobs
       set lifecycle_status = 'EXPIRED',
           expired_at = coalesce(expired_at, now()),
           closure_signal = 'FIRST_PARTY_CLOSED',
           updated_at = now()
     where recruitment_vacancy_id = v_vac.id
    returning id into v_radar_job_id;
    return v_radar_job_id;
  end if;

  insert into public.radar_jobs (
    employer_id,
    recruitment_vacancy_id,
    canonical_fingerprint,
    requisition_cluster_key,
    canonical_url_hash,
    title_company_loc_hash,
    external_requisition_id,
    title,
    normalized_title,
    company_name,
    career_category,
    seniority_level,
    employment_type,
    workplace_type,
    location_raw,
    country_code,
    salary_min,
    salary_max,
    salary_currency,
    salary_period,
    description_clean,
    content_hash,
    extraction_method,
    apply_url,
    canonical_apply_url,
    apply_mechanism,
    auto_apply_adapter,
    requires_human_form_review,
    employer_verification_status,
    vacancy_authenticity_status,
    verified_by_deterministic_evidence,
    employer_legitimacy_score,
    job_authenticity_score,
    application_safety_score,
    verification_status,
    risk_flags,
    lifecycle_status,
    missing_poll_streak,
    closure_signal,
    posted_at,
    first_seen_at,
    last_seen_at,
    last_confirmed_live_at,
    discovery_origin,
    first_direct_seen_at,
    exclusivity_tier,
    updated_at
  )
  values (
    v_radar_employer_id,
    v_vac.id,
    v_fingerprint,
    v_cluster_key,
    encode(extensions.digest(v_apply_url, 'sha256'), 'hex'),
    v_title_loc_hash,
    v_vac.id::text,
    trim(v_vac.title),
    lower(trim(v_vac.title)),
    v_org.company_name,
    v_vac.career_category,
    v_vac.seniority_level,
    v_vac.employment_preference,
    v_workplace,
    v_vac.location,
    case
      when v_org.country is not null and char_length(trim(v_org.country)) = 2
        then upper(trim(v_org.country))
      else null
    end,
    v_vac.salary_min,
    v_vac.salary_max,
    upper(coalesce(nullif(trim(v_vac.salary_currency), ''), 'USD')),
    case when v_vac.salary_min is not null or v_vac.salary_max is not null then 'YEAR' else null end,
    v_desc,
    v_content_hash,
    'DETERMINISTIC',
    v_apply_url,
    v_apply_url,
    'FIRST_PARTY_PORTAL',
    null,
    false,
    'FIRST_PARTY_VERIFIED',
    'FIRST_PARTY_POSTED',
    true,
    96,
    98,
    98,
    'VERIFIED_HIGH_TRUST',
    '{}'::text[],
    'ACTIVE',
    0,
    'NONE',
    v_vac.created_at,
    v_vac.created_at,
    now(),
    now(),
    'FIRST_PARTY_EMPLOYER',
    v_vac.created_at,
    'FIRST_PARTY_EXCLUSIVE',
    now()
  )
  on conflict (canonical_fingerprint) do update
    set title = excluded.title,
        normalized_title = excluded.normalized_title,
        company_name = excluded.company_name,
        career_category = excluded.career_category,
        seniority_level = excluded.seniority_level,
        employment_type = excluded.employment_type,
        workplace_type = excluded.workplace_type,
        location_raw = excluded.location_raw,
        salary_min = excluded.salary_min,
        salary_max = excluded.salary_max,
        salary_currency = excluded.salary_currency,
        salary_period = excluded.salary_period,
        description_clean = excluded.description_clean,
        content_hash = excluded.content_hash,
        employer_verification_status = 'FIRST_PARTY_VERIFIED',
        vacancy_authenticity_status = 'FIRST_PARTY_POSTED',
        verified_by_deterministic_evidence = true,
        verification_status = 'VERIFIED_HIGH_TRUST',
        lifecycle_status = 'ACTIVE',
        missing_poll_streak = 0,
        first_missing_at = null,
        expired_at = null,
        closure_signal = 'NONE',
        last_seen_at = now(),
        last_confirmed_live_at = now(),
        exclusivity_tier = 'FIRST_PARTY_EXCLUSIVE',
        updated_at = now()
  returning id into v_radar_job_id;

  -- Record deterministic provenance evidence idempotently (`radar_verification_evidence`)
  v_evidence_hash := encode(
    extensions.digest('fp_ev:' || v_org.id::text || ':' || v_vac.id::text, 'sha256'),
    'hex'
  );

  insert into public.radar_verification_evidence (
    subject_type,
    subject_id,
    evidence_kind,
    is_deterministic,
    direction,
    score_delta,
    evidence_summary,
    evidence_hash
  )
  values (
    'JOB',
    v_radar_job_id,
    'FIRST_PARTY_ORG_APPROVAL',
    true,
    'POSITIVE',
    45,
    'Posted directly by verified Jobiest employer organization (' || v_org.company_name || ')',
    v_evidence_hash
  )
  on conflict (subject_type, subject_id, evidence_kind, evidence_hash) do nothing;

  return v_radar_job_id;
end;
$$;

revoke all on function public.sync_recruitment_vacancy_to_radar_by_id(uuid) from public, anon, authenticated;
grant execute on function public.sync_recruitment_vacancy_to_radar_by_id(uuid) to service_role;


-- 3. Trigger functions on `recruitment_vacancies` and `employer_organizations`
create or replace function public.tg_sync_recruitment_vacancy_to_radar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.sync_recruitment_vacancy_to_radar_by_id(new.id);
  return new;
end;
$$;

revoke all on function public.tg_sync_recruitment_vacancy_to_radar() from public, anon, authenticated;
grant execute on function public.tg_sync_recruitment_vacancy_to_radar() to service_role;

drop trigger if exists trg_sync_recruitment_vacancy_to_radar on public.recruitment_vacancies;
create trigger trg_sync_recruitment_vacancy_to_radar
  after insert or update on public.recruitment_vacancies
  for each row
  execute function public.tg_sync_recruitment_vacancy_to_radar();


create or replace function public.tg_sync_employer_org_status_to_radar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  if new.verification_status = 'VERIFIED' and old.verification_status is distinct from 'VERIFIED' then
    for r in
      select id from public.recruitment_vacancies where organization_id = new.id and status = 'OPEN'
    loop
      perform public.sync_recruitment_vacancy_to_radar_by_id(r.id);
    end loop;
  elsif new.verification_status <> 'VERIFIED' and old.verification_status = 'VERIFIED' then
    update public.radar_employers
       set employer_verification_status = case
             when new.verification_status in ('REJECTED', 'SUSPENDED') then 'BLOCKED'
             else 'UNVERIFIED'
           end,
           verified_by_deterministic_evidence = false,
           updated_at = now()
     where employer_organization_id = new.id;

    update public.radar_jobs
       set lifecycle_status = 'QUARANTINED',
           closure_signal = 'FIRST_PARTY_CLOSED',
           updated_at = now()
     where recruitment_vacancy_id in (
       select id from public.recruitment_vacancies where organization_id = new.id
     )
       and lifecycle_status in ('ACTIVE', 'POTENTIALLY_CLOSING');
  end if;
  return new;
end;
$$;

revoke all on function public.tg_sync_employer_org_status_to_radar() from public, anon, authenticated;
grant execute on function public.tg_sync_employer_org_status_to_radar() to service_role;

drop trigger if exists trg_sync_employer_org_status_to_radar on public.employer_organizations;
create trigger trg_sync_employer_org_status_to_radar
  after update of verification_status on public.employer_organizations
  for each row
  execute function public.tg_sync_employer_org_status_to_radar();


-- 4. Idempotent backfill for any existing VERIFIED org OPEN vacancies
do $$
declare
  v_row record;
begin
  for v_row in
    select rv.id
    from public.recruitment_vacancies rv
    join public.employer_organizations eo on eo.id = rv.organization_id
    where eo.verification_status = 'VERIFIED'
  loop
    perform public.sync_recruitment_vacancy_to_radar_by_id(v_row.id);
  end loop;
end;
$$;


-- 5. Employment Intelligence Network Telemetry Summary RPC (service_role only)
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
    )
  ) into v_summary;

  return v_summary;
end;
$$;

revoke all on function public.get_radar_intelligence_summary() from public, anon, authenticated;
grant execute on function public.get_radar_intelligence_summary() to service_role;
