-- 007_generated_documents.sql
-- Immutable, versioned generated documents (CV / cover-letter / answers) with
-- source-fact references for traceability (Trust Principles). No UPDATE policy —
-- documents are append-only; a new version is a new row. Writes via service role.
create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  kind text not null,                       -- CV | COVER_LETTER | ANSWERS
  title text not null,
  content_hash text not null,               -- SHA-256 of generated content (immutability)
  storage_path text,                        -- optional private storage path
  source_facts jsonb not null default '{}', -- references to verified profile facts used
  version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists generated_documents_user_idx on public.generated_documents(user_id, created_at desc);
alter table public.generated_documents enable row level security;
drop policy if exists generated_documents_self on public.generated_documents;
create policy generated_documents_self on public.generated_documents
  for select using (auth.uid() = user_id);
comment on column public.generated_documents.source_facts is 'References to the verified profile facts used to generate this document, for traceability.';
comment on column public.generated_documents.content_hash is 'SHA-256 of the generated content; makes each version immutable and verifiable.';
