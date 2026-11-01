-- Rollback script for 053..055 (Global Opportunity Radar Phase 1 foundation)
-- Operator DBA reference only. Preserves all pre-existing 001..052 tables,
-- seeded job_sources rows, and candidate/employer data.

begin;

drop function if exists public.match_radar_jobs_for_embedding(extensions.vector, text[], integer, integer);
drop function if exists public.claim_due_radar_sources(integer, integer);

drop index if exists public.jobs_canonical_radar_job_idx;
alter table public.jobs drop column if exists canonical_radar_job_id;

drop table if exists public.radar_crawl_runs;
drop table if exists public.radar_source_candidates;
drop table if exists public.radar_job_embeddings;
drop table if exists public.radar_application_forms;
drop table if exists public.radar_verification_evidence;
drop table if exists public.radar_job_sources;
drop table if exists public.radar_jobs;

drop index if exists public.job_sources_due_poll_idx;
alter table public.job_sources
  drop column if exists lease_expires_at,
  drop column if exists lease_token,
  drop column if exists discovered_via,
  drop column if exists trust_level,
  drop column if exists priority,
  drop column if exists crawl_delay_seconds,
  drop column if exists robots_checked_at,
  drop column if exists robots_status,
  drop column if exists last_item_count,
  drop column if exists last_complete_poll_at,
  drop column if exists last_payload_hash,
  drop column if exists last_modified_header,
  drop column if exists etag,
  drop column if exists next_poll_at,
  drop column if exists poll_interval_minutes,
  drop column if exists commercial_indexing_allowed,
  drop column if exists collection_permission,
  drop column if exists source_url,
  drop column if exists provider_policy_key,
  drop column if exists employer_id;

alter table public.job_sources drop constraint if exists job_sources_adapter_values;
alter table public.job_sources
  add constraint job_sources_adapter_values
  check (adapter in ('greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters'));

drop table if exists public.radar_exclusions;
drop table if exists public.radar_employers;
drop table if exists public.radar_provider_policies;

commit;
