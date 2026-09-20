-- 028: SEO keyword database upgrade (Master Upgrade Workstream A, Stage 2).
-- Adds the A5.3 keyword research schema to the existing seo_keywords table
-- and relaxes uniqueness to allow one row per keyword per market.
-- Honest-data rules enforced by checks: search_volume/difficulty are either
-- 'Unknown' or a plain number; never a fabricated estimate.
-- Rollback: drop the added columns, the new constraint and indexes, then
-- re-add unique(project_id, keyword) if per-keyword uniqueness is required.

alter table public.seo_keywords
  add column if not exists query_source text,
  add column if not exists source_url text,
  add column if not exists collection_date date,
  add column if not exists country text,
  add column if not exists language text default 'en',
  add column if not exists search_volume text
    check (search_volume is null or search_volume = 'Unknown' or search_volume ~ '^[0-9]+$'),
  add column if not exists volume_source text,
  add column if not exists difficulty text
    check (difficulty is null or difficulty = 'Unknown' or difficulty ~ '^[0-9]+$'),
  add column if not exists difficulty_source text,
  add column if not exists serp_observations text,
  add column if not exists top_competitors text,
  add column if not exists existing_jobiest_url text,
  add column if not exists content_opportunity text,
  add column if not exists conversion_relevance text
    check (conversion_relevance is null or conversion_relevance in ('HIGH','MEDIUM','LOW')),
  add column if not exists confidence_level text
    check (confidence_level is null or confidence_level in ('Observed','Estimated','Qualitative','Hypothesis')),
  add column if not exists recommended_action text
    check (recommended_action is null or recommended_action in ('Create','Update','Skip')),
  add column if not exists seed_query text;

-- Allow one row per keyword per market. NULL country (legacy rows, market not
-- recorded) never conflicts because NULLs are distinct in Postgres.
alter table public.seo_keywords
  drop constraint if exists seo_keywords_project_id_keyword_key;
alter table public.seo_keywords
  add constraint seo_keywords_project_keyword_country_key
  unique (project_id, keyword, country);

create index if not exists seo_keywords_country_idx on public.seo_keywords (country);
create index if not exists seo_keywords_confidence_idx on public.seo_keywords (confidence_level);
create index if not exists seo_keywords_action_idx on public.seo_keywords (recommended_action);

comment on column public.seo_keywords.search_volume is 'Numeric only from an Observed source, otherwise the literal text Unknown. Never fabricated.';
comment on column public.seo_keywords.difficulty is 'Numeric only when a real tool provided a score, otherwise the literal text Unknown. Never fabricated.';
comment on column public.seo_keywords.confidence_level is 'Observed / Estimated / Qualitative / Hypothesis per the Master Upgrade brief definitions.';
comment on column public.seo_keywords.country is 'ISO country code for the market this row was researched in. Never combine markets into one estimate.';
comment on column public.seo_keywords.query_source is 'How the query was discovered, for example google_autocomplete.';
