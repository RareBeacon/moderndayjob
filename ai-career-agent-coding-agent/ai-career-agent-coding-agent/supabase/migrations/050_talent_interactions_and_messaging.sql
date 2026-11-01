-- 050_talent_interactions_and_messaging.sql
-- Jobiest Talent Pool: employer contact requests, interview invitations,
-- candidate-authorized messaging threads, and abuse/misconduct reporting.
--
-- Reversible rollback order (manual DBA down-script):
--   drop table if exists public.talent_interaction_reports;
--   drop table if exists public.talent_messages;
--   drop table if exists public.talent_conversations;
--   drop table if exists public.talent_contact_requests;

create table if not exists public.talent_contact_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  vacancy_id uuid references public.recruitment_vacancies(id) on delete set null,
  request_type text not null check (request_type in ('CONTACT_REQUEST', 'INTERVIEW_INVITATION')),
  role_title text not null,
  message text not null,
  proposed_slots jsonb not null default '[]'::jsonb,
  meeting_format text,
  compensation_range text,
  status text not null default 'PENDING' check (
    status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'REPORTED')
  ),
  candidate_response_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_contact_requests_candidate_idx
  on public.talent_contact_requests (candidate_user_id, status, created_at desc);

create index if not exists talent_contact_requests_org_idx
  on public.talent_contact_requests (organization_id, status, created_at desc);

alter table public.talent_contact_requests enable row level security;

drop policy if exists "talent_contact_requests_candidate_read" on public.talent_contact_requests;
create policy "talent_contact_requests_candidate_read"
  on public.talent_contact_requests
  for select to authenticated
  using (auth.uid() = candidate_user_id);


create table if not exists public.talent_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.employer_organizations(id) on delete cascade,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  contact_request_id uuid references public.talent_contact_requests(id) on delete set null,
  subject text not null,
  status text not null default 'ACTIVE' check (
    status in ('PENDING_CANDIDATE', 'ACTIVE', 'DECLINED', 'REPORTED', 'ARCHIVED')
  ),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, candidate_user_id)
);

create index if not exists talent_conversations_candidate_idx
  on public.talent_conversations (candidate_user_id, last_message_at desc);

create index if not exists talent_conversations_org_idx
  on public.talent_conversations (organization_id, last_message_at desc);

alter table public.talent_conversations enable row level security;

drop policy if exists "talent_conversations_participant_read" on public.talent_conversations;
create policy "talent_conversations_participant_read"
  on public.talent_conversations
  for select to authenticated
  using (
    auth.uid() = candidate_user_id
    or exists (
      select 1
      from public.employer_members m
      where m.organization_id = talent_conversations.organization_id
        and m.user_id = auth.uid()
        and m.status = 'ACTIVE'
    )
  );


create table if not exists public.talent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.talent_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  sender_role text not null check (sender_role in ('RECRUITER', 'CANDIDATE')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists talent_messages_conversation_idx
  on public.talent_messages (conversation_id, created_at asc);

alter table public.talent_messages enable row level security;

drop policy if exists "talent_messages_participant_read" on public.talent_messages;
create policy "talent_messages_participant_read"
  on public.talent_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.talent_conversations c
      where c.id = talent_messages.conversation_id
        and (
          c.candidate_user_id = auth.uid()
          or exists (
            select 1
            from public.employer_members m
            where m.organization_id = c.organization_id
              and m.user_id = auth.uid()
              and m.status = 'ACTIVE'
          )
        )
    )
  );


create table if not exists public.talent_interaction_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  reporter_role text not null check (reporter_role in ('CANDIDATE', 'RECRUITER')),
  organization_id uuid references public.employer_organizations(id) on delete set null,
  candidate_user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.talent_conversations(id) on delete set null,
  contact_request_id uuid references public.talent_contact_requests(id) on delete set null,
  reason_category text not null check (
    reason_category in ('SPAM', 'HARASSMENT', 'SCAM_OR_FRAUD', 'OFF_PLATFORM_SOLICITATION', 'MISREPRESENTATION', 'OTHER')
  ),
  details text not null check (char_length(btrim(details)) between 10 and 2000),
  status text not null default 'OPEN' check (
    status in ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')
  ),
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists talent_interaction_reports_status_idx
  on public.talent_interaction_reports (status, created_at desc);

alter table public.talent_interaction_reports enable row level security;
