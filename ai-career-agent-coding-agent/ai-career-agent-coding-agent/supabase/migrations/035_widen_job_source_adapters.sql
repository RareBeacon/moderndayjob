-- 035_widen_job_source_adapters.sql
--
-- The employer's-front-door build (2026-09-21): Workable and SmartRecruiters
-- join Greenhouse, Lever, and Ashby as supported public job-board sources.
-- Both adapters read documented, unauthenticated public APIs verified live
-- on 2026-09-21 (Workable widget API; SmartRecruiters postings API).
-- SmartRecruiters has no job_sources rows yet (its apply form is not
-- verified; enabling later is one insert per company), but the adapter
-- value is allowed now so no further schema change is needed then.

alter table public.job_sources drop constraint job_sources_adapter_values;
alter table public.job_sources
  add constraint job_sources_adapter_values
  check (adapter in ('greenhouse','lever','ashby','workable','smartrecruiters'));
