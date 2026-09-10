-- 020_seo_content_calendar.sql
-- Keyword opportunity/content-calendar fields and richer article metadata.

alter table public.seo_keywords add column if not exists primary_topic text;
alter table public.seo_keywords add column if not exists related_free_tool text;
alter table public.seo_keywords add column if not exists business_value text not null default 'MEDIUM';
alter table public.seo_keywords add column if not exists competition text not null default 'UNKNOWN';
alter table public.seo_keywords add column if not exists content_type text not null default 'blog_post';
alter table public.seo_keywords add column if not exists status text not null default 'PLANNED';
alter table public.seo_keywords add column if not exists publication_date date;
alter table public.seo_keywords add column if not exists research_source text not null default 'unavailable';
alter table public.seo_keywords add column if not exists source_timestamp timestamptz;

alter table public.seo_articles add column if not exists featured_image_url text;
alter table public.seo_articles add column if not exists faq jsonb not null default '[]'::jsonb;
alter table public.seo_articles add column if not exists internal_links text[] not null default '{}';
alter table public.seo_articles add column if not exists content_cluster text;
alter table public.seo_articles add column if not exists publication_order int;

comment on column public.seo_keywords.competition is 'Qualitative/manual/heuristic competition notes only. Never fabricated keyword difficulty.';
comment on column public.seo_keywords.opportunity_score is 'Heuristic business-priority score from relevance, intent and conversion fit, not search-volume or keyword-difficulty data.';
comment on column public.seo_keywords.research_source is 'Where the opportunity came from, for example user-provided GSC overview, public SERP review, first-party GSC API, or internal content audit.';
comment on column public.seo_articles.faq is 'Article FAQ entries generated only where useful, stored as [{question, answer}].';
