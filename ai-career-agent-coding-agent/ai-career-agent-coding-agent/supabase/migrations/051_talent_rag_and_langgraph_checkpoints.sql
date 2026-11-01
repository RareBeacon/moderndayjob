-- 051_talent_rag_and_langgraph_checkpoints.sql
-- RAG pgvector document/chunk index, versioned assessment contexts,
-- personalized interview blueprints, and persistent LangGraph checkpoints.

create extension if not exists vector;

create table if not exists public.talent_rag_documents (
  id uuid primary key default gen_random_uuid(),
  namespace text not null check (namespace in ('CANDIDATE_KNOWLEDGE', 'JOB_COMPETENCY_KNOWLEDGE', 'ASSESSMENT_KNOWLEDGE')),
  candidate_user_id uuid references auth.users(id) on delete cascade,
  source_document_id uuid,
  document_type text not null,
  source text not null,
  career_category text,
  job_title text,
  experience_level text,
  version integer not null default 1 check (version >= 1),
  content_sha256 text not null,
  chunk_count integer not null default 0 check (chunk_count >= 0),
  pii_redacted boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  indexed_at timestamptz not null default now(),
  stale_at timestamptz,
  created_at timestamptz not null default now(),
  constraint talent_rag_candidate_isolation_chk check (
    (namespace = 'CANDIDATE_KNOWLEDGE' and candidate_user_id is not null)
    or (namespace <> 'CANDIDATE_KNOWLEDGE' and candidate_user_id is null)
  )
);

create index if not exists idx_talent_rag_docs_candidate
  on public.talent_rag_documents(candidate_user_id, is_active, document_type);

create index if not exists idx_talent_rag_docs_shared
  on public.talent_rag_documents(namespace, career_category, experience_level, is_active);

create unique index if not exists uq_talent_rag_docs_active_hash
  on public.talent_rag_documents(coalesce(candidate_user_id, '00000000-0000-0000-0000-000000000000'::uuid), namespace, document_type, content_sha256)
  where is_active is true;

alter table public.talent_rag_documents enable row level security;

create policy "talent_rag_documents_owner_select"
  on public.talent_rag_documents
  for select
  to authenticated
  using (
    (namespace = 'CANDIDATE_KNOWLEDGE' and candidate_user_id = auth.uid())
    or (namespace in ('JOB_COMPETENCY_KNOWLEDGE', 'ASSESSMENT_KNOWLEDGE') and auth.uid() is not null)
  );

create table if not exists public.talent_rag_chunks (
  id uuid primary key default gen_random_uuid(),
  document_ref_id uuid not null references public.talent_rag_documents(id) on delete cascade,
  namespace text not null check (namespace in ('CANDIDATE_KNOWLEDGE', 'JOB_COMPETENCY_KNOWLEDGE', 'ASSESSMENT_KNOWLEDGE')),
  candidate_user_id uuid references auth.users(id) on delete cascade,
  source_document_id uuid,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_text text not null,
  token_estimate integer not null default 0 check (token_estimate >= 0),
  career_category text,
  job_title text,
  skills text[] not null default '{}',
  experience_level text,
  document_type text not null,
  source text not null,
  version integer not null default 1 check (version >= 1),
  embedding vector(384) not null,
  embedding_model text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint talent_rag_chunks_candidate_isolation_chk check (
    (namespace = 'CANDIDATE_KNOWLEDGE' and candidate_user_id is not null)
    or (namespace <> 'CANDIDATE_KNOWLEDGE' and candidate_user_id is null)
  ),
  unique (document_ref_id, chunk_index)
);

create index if not exists idx_talent_rag_chunks_candidate
  on public.talent_rag_chunks(candidate_user_id, namespace, document_type);

create index if not exists idx_talent_rag_chunks_shared
  on public.talent_rag_chunks(namespace, career_category, experience_level);

create index if not exists idx_talent_rag_chunks_skills
  on public.talent_rag_chunks using gin (skills);

alter table public.talent_rag_chunks enable row level security;

create policy "talent_rag_chunks_owner_select"
  on public.talent_rag_chunks
  for select
  to authenticated
  using (
    (namespace = 'CANDIDATE_KNOWLEDGE' and candidate_user_id = auth.uid())
    or (namespace in ('JOB_COMPETENCY_KNOWLEDGE', 'ASSESSMENT_KNOWLEDGE') and auth.uid() is not null)
  );

create or replace function public.match_talent_rag_chunks(
  p_query_embedding vector(384),
  p_namespace text,
  p_candidate_user_id uuid default null,
  p_career_category text default null,
  p_experience_level text default null,
  p_document_type text default null,
  p_match_count integer default 8
)
returns table (
  chunk_id uuid,
  document_ref_id uuid,
  source_document_id uuid,
  namespace text,
  candidate_user_id uuid,
  chunk_index integer,
  chunk_text text,
  career_category text,
  job_title text,
  skills text[],
  experience_level text,
  document_type text,
  source text,
  version integer,
  metadata jsonb,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_namespace = 'CANDIDATE_KNOWLEDGE' and p_candidate_user_id is null then
    raise exception 'CANDIDATE_ID_REQUIRED_FOR_CANDIDATE_RAG';
  end if;

  return query
  select
    c.id as chunk_id,
    c.document_ref_id,
    c.source_document_id,
    c.namespace,
    c.candidate_user_id,
    c.chunk_index,
    c.chunk_text,
    c.career_category,
    c.job_title,
    c.skills,
    c.experience_level,
    c.document_type,
    c.source,
    c.version,
    c.metadata,
    (1 - (c.embedding <=> p_query_embedding))::double precision as similarity
  from public.talent_rag_chunks c
  inner join public.talent_rag_documents d on d.id = c.document_ref_id and d.is_active is true
  where c.namespace = p_namespace
    and (
      (p_namespace = 'CANDIDATE_KNOWLEDGE' and c.candidate_user_id = p_candidate_user_id)
      or (p_namespace <> 'CANDIDATE_KNOWLEDGE' and c.candidate_user_id is null)
    )
    and (p_career_category is null or c.career_category is null or c.career_category = p_career_category)
    and (p_experience_level is null or c.experience_level is null or c.experience_level = p_experience_level)
    and (p_document_type is null or c.document_type = p_document_type)
  order by c.embedding <=> p_query_embedding asc
  limit least(greatest(p_match_count, 1), 25);
end;
$$;

create table if not exists public.talent_assessment_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.talent_applications(id) on delete set null,
  context_version integer not null default 1 check (context_version >= 1),
  prompt_version text not null,
  career_category text,
  professional_title text,
  seniority_level text,
  years_of_experience numeric(4,1),
  completeness_score numeric(5,2) not null default 0,
  eligible_for_interview boolean not null default false,
  candidate_confirmed boolean not null default false,
  candidate_confirmed_at timestamptz,
  declared_claims jsonb not null default '{}'::jsonb,
  document_extracted_claims jsonb not null default '{}'::jsonb,
  verified_evidence jsonb not null default '{}'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  contradictory_information jsonb not null default '[]'::jsonb,
  analysis_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_assessment_contexts_user
  on public.talent_assessment_contexts(user_id, created_at desc);

alter table public.talent_assessment_contexts enable row level security;

create policy "talent_assessment_contexts_owner_select"
  on public.talent_assessment_contexts
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "talent_assessment_contexts_owner_update"
  on public.talent_assessment_contexts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.talent_interview_blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.talent_applications(id) on delete cascade,
  session_id uuid references public.talent_interview_sessions(id) on delete set null,
  assessment_context_id uuid references public.talent_assessment_contexts(id) on delete set null,
  blueprint_version integer not null default 1 check (blueprint_version >= 1),
  prompt_version text not null,
  career_category text not null,
  professional_title text not null,
  seniority_level text not null,
  question_count integer not null check (question_count >= 1 and question_count <= 30),
  estimated_duration_minutes integer not null default 25,
  questions_json jsonb not null default '[]'::jsonb,
  quality_validation_json jsonb not null default '{}'::jsonb,
  rag_citations_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_talent_blueprints_app
  on public.talent_interview_blueprints(application_id, created_at desc);

alter table public.talent_interview_blueprints enable row level security;

create policy "talent_interview_blueprints_owner_select"
  on public.talent_interview_blueprints
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'ADMIN'
    )
  );

create table if not exists public.talent_workflow_checkpoints (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.talent_applications(id) on delete cascade,
  session_id uuid references public.talent_interview_sessions(id) on delete set null,
  idempotency_key text not null,
  current_node text not null,
  completed_nodes text[] not null default '{}',
  workflow_status text not null check (workflow_status in (
    'RUNNING', 'AWAITING_CANDIDATE_CONFIRMATION', 'AWAITING_CANDIDATE_ANSWER',
    'PAUSED_INTERRUPTION', 'COMPLETED', 'FAILED'
  )),
  state_json jsonb not null default '{}'::jsonb,
  interruption_reason text,
  error_code text,
  total_input_tokens integer not null default 0,
  total_output_tokens integer not null default 0,
  estimated_cost_usd numeric(10,6) not null default 0,
  total_latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_workflow_checkpoints_user
  on public.talent_workflow_checkpoints(user_id, updated_at desc);

create index if not exists idx_talent_workflow_checkpoints_session
  on public.talent_workflow_checkpoints(session_id);

alter table public.talent_workflow_checkpoints enable row level security;

create policy "talent_workflow_checkpoints_owner_select"
  on public.talent_workflow_checkpoints
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'ADMIN'
    )
  );
