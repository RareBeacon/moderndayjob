-- 029: Intelligent AI customer support core (Master Upgrade Workstream B).
-- Conversations, messages, tickets, knowledge base, analytics events.
-- All tables are service-role only (widget talks to API routes, never to
-- these tables directly). Rollback: drop the five tables in reverse order.

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  visitor_key text,
  route text,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  escalated boolean not null default false,
  kb_used text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id text primary key,
  conversation_id uuid references public.support_conversations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  category text not null,
  priority text not null default 'NORMAL',
  status text not null default 'OPEN',
  subject text not null,
  body text not null,
  email_status text not null default 'PENDING',
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_kb_entries (
  id text primary key,
  question text not null,
  answer_md text not null,
  topics text[] not null default '{}',
  live_url_verified boolean not null default false,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  conversation_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_chat_messages_conversation_idx on public.support_chat_messages (conversation_id, created_at);
create index if not exists support_tickets_created_idx on public.support_tickets (created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status);
create index if not exists support_analytics_type_idx on public.support_analytics_events (event_type, created_at desc);

alter table public.support_conversations enable row level security;
alter table public.support_chat_messages enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_kb_entries enable row level security;
alter table public.support_analytics_events enable row level security;

revoke select, insert, update, delete on public.support_conversations from anon, authenticated;
revoke select, insert, update, delete on public.support_chat_messages from anon, authenticated;
revoke select, insert, update, delete on public.support_tickets from anon, authenticated;
revoke select, insert, update, delete on public.support_kb_entries from anon, authenticated;
revoke select, insert, update, delete on public.support_analytics_events from anon, authenticated;
