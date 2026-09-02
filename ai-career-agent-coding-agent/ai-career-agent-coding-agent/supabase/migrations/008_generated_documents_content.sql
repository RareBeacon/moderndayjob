-- 008_generated_documents_content.sql
-- Phase 7 (Application Intelligence): store the full generated text so each
-- versioned document is complete and independently verifiable (paired with the
-- existing content_hash). The table remains append-only, this column is only
-- ever written on INSERT. Writes use the service role.
alter table public.generated_documents add column if not exists content text;
alter table public.generated_documents add column if not exists model text;
comment on column public.generated_documents.content is 'Full generated text/JSON (CV/cover-letter/answers). Append-only; integrity verified via content_hash.';
