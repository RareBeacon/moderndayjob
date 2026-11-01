-- 055_radar_embeddings_runs_and_rpcs.sql
-- Jobiest Global Opportunity Radar (Phase 1):
--   1. radar_job_embeddings: vector(384) aligned with talent_rag_chunks (051).
--   2. radar_source_candidates: Employment Intelligence Network discovery queue
--      for newly detected employers, career pages, ATS boards, and forms.
--   3. radar_crawl_runs: crawl/poll telemetry without raw payload exposure.
--   4. Atomic service-role RPCs: claim_due_radar_sources and
--      match_radar_jobs_for_embedding (pinned search_path = public, extensions).

create extension if not exists vector;
set search_path = public, extensions;

-- ============================================================================
-- 1) Semantic Job Embeddings (vector(384) aligned with 051_talent_rag)
-- ============================================================================
create table if not exists public.radar_job_embeddings (
  radar_job_id     uuid primary key references public.radar_jobs(id) on delete cascade,
  embedding        vector(384) not null,
  embedding_model  text not null,
  content_hash     text not null,
  updated_at       timestamptz not null default now()
);

create index if not exists radar_job_embeddings_hnsw_idx
  on public.radar_job_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.radar_job_embeddings enable row level security;
revoke all on public.radar_job_embeddings from anon, authenticated;

-- ============================================================================
-- 2) Candidate Source Queue (Employment Intelligence Network Expansion)
-- ============================================================================
create table if not exists public.radar_source_candidates (
  id                       uuid primary key default gen_random_uuid(),
  discovered_url           text not null unique,
  normalized_host          text not null,
  detected_provider        text,
  detected_board_token     text,
  employer_domain_hint     text,
  discovery_channel        text not null check (
    discovery_channel in (
      'COMMON_CRAWL_CDX',
      'CT_SUBDOMAIN_LOG',
      'EMPLOYER_HOMEPAGE_LINK',
      'COMMUNITY_THREAD_LINK',
      'ADMIN_SUBMISSION'
    )
  ),
  review_status            text not null default 'QUEUED_VALIDATION' check (
    review_status in ('QUEUED_VALIDATION', 'PROMOTED_TO_SOURCE', 'REJECTED_COMPLIANCE', 'REJECTED_DEAD', 'DUPLICATE')
  ),
  rejection_reason         text,
  promoted_source_id       text references public.job_sources(id) on delete set null,
  first_seen_at            timestamptz not null default now(),
  evaluated_at             timestamptz
);

create index if not exists radar_source_candidates_status_idx
  on public.radar_source_candidates (review_status, first_seen_at asc);

alter table public.radar_source_candidates enable row level security;
revoke all on public.radar_source_candidates from anon, authenticated;

-- ============================================================================
-- 3) Crawl Run Telemetry (Condition 4: metrics only, zero raw payload storage)
-- ============================================================================
create table if not exists public.radar_crawl_runs (
  id                       uuid primary key default gen_random_uuid(),
  source_id                text not null references public.job_sources(id) on delete cascade,
  outcome                  text not null check (
    outcome in (
      'OK_COMPLETE',
      'NOT_MODIFIED_304',
      'UNCHANGED_HASH',
      'SKIPPED_COMPLIANCE',
      'SKIPPED_ROBOTS',
      'ANOMALOUS_EMPTY_DROP',
      'HTTP_ERROR',
      'NETWORK_OR_SSRF_BLOCKED',
      'PARSE_ERROR'
    )
  ),
  http_status              integer,
  bytes_fetched            integer not null default 0 check (bytes_fetched >= 0),
  items_seen               integer not null default 0 check (items_seen >= 0),
  items_created            integer not null default 0 check (items_created >= 0),
  items_updated            integer not null default 0 check (items_updated >= 0),
  items_expired            integer not null default 0 check (items_expired >= 0),
  ai_tokens_used           integer not null default 0 check (ai_tokens_used >= 0),
  duration_ms              integer not null default 0 check (duration_ms >= 0),
  error_code               text,
  started_at               timestamptz not null default now(),
  finished_at              timestamptz not null default now()
);

create index if not exists radar_crawl_runs_source_idx
  on public.radar_crawl_runs (source_id, started_at desc);

alter table public.radar_crawl_runs enable row level security;
revoke all on public.radar_crawl_runs from anon, authenticated;

-- ============================================================================
-- 4) Atomic Source Leasing RPC (FOR UPDATE SKIP LOCKED, service_role only)
-- ============================================================================
create or replace function public.claim_due_radar_sources(
  p_limit integer default 10,
  p_lease_seconds integer default 180
)
returns setof public.job_sources
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := encode(gen_random_bytes(16), 'hex');
  v_now timestamptz := now();
begin
  return query
  with due as (
    select s.id
    from public.job_sources s
    left join public.radar_provider_policies p
      on p.provider_key = s.provider_policy_key
    where s.enabled = true
      and s.commercial_indexing_allowed = true
      and coalesce(p.commercial_indexing_allowed, true) = true
      and s.collection_permission not in ('RESTRICTED_PENDING_REVIEW', 'PROHIBITED')
      and s.robots_status <> 'DISALLOWED'
      and (s.cooldown_until is null or s.cooldown_until <= v_now)
      and s.next_poll_at <= v_now
      and (s.lease_expires_at is null or s.lease_expires_at <= v_now)
    order by s.priority desc, s.next_poll_at asc
    limit least(greatest(p_limit, 1), 50)
    for update of s skip locked
  )
  update public.job_sources target
     set lease_token = v_token,
         lease_expires_at = v_now + make_interval(secs => greatest(p_lease_seconds, 30)),
         updated_at = v_now
    from due
   where target.id = due.id
  returning target.*;
end;
$$;

revoke all on function public.claim_due_radar_sources(integer, integer) from public, anon, authenticated;

-- ============================================================================
-- 5) Semantic Opportunity Matching RPC (vector(384), service_role only)
-- ============================================================================
create or replace function public.match_radar_jobs_for_embedding(
  p_query_embedding vector,
  p_workplace_types text[] default null,
  p_min_confidence integer default 60,
  p_limit integer default 25
)
returns table (
  radar_job_id uuid,
  title text,
  company_name text,
  workplace_type text,
  location_raw text,
  country_code text,
  apply_url text,
  apply_mechanism text,
  auto_apply_adapter text,
  requires_human_form_review boolean,
  verification_status text,
  composite_confidence smallint,
  exclusivity_tier text,
  posted_at timestamptz,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if vector_dims(p_query_embedding) <> 384 then
    raise exception 'INVALID_EMBEDDING_DIMENSION_EXPECTED_384';
  end if;

  return query
  select
    j.id as radar_job_id,
    j.title,
    j.company_name,
    j.workplace_type,
    j.location_raw,
    j.country_code,
    j.apply_url,
    j.apply_mechanism,
    j.auto_apply_adapter,
    j.requires_human_form_review,
    j.verification_status,
    j.composite_confidence,
    j.exclusivity_tier,
    j.posted_at,
    (1 - (e.embedding <=> p_query_embedding))::double precision as similarity
  from public.radar_job_embeddings e
  inner join public.radar_jobs j
    on j.id = e.radar_job_id
  where j.lifecycle_status = 'ACTIVE'
    and j.verification_status in ('VERIFIED_HIGH_TRUST', 'VERIFIED_STANDARD', 'UNVERIFIED_EXTERNAL_FORM')
    and j.composite_confidence >= p_min_confidence
    and (p_workplace_types is null or cardinality(p_workplace_types) = 0 or j.workplace_type = any(p_workplace_types))
  order by e.embedding <=> p_query_embedding asc
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.match_radar_jobs_for_embedding(vector, text[], integer, integer) from public, anon, authenticated;
