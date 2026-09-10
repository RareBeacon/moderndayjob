-- Audit trail for security-sensitive actions (spec 48).
--
-- Access model: NO RLS policies are created, so with RLS enabled neither
-- `anon` nor `authenticated` can read or write these rows. The application
-- writes through the service role only. Rows are retained for security
-- review and deleted via Supabase's retention/cleanup tooling if needed.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource text,
  resource_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

-- Intentionally: no policies. Deny-by-default keeps the table private.

create index if not exists audit_logs_user_created_idx
  on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

-- Keep metadata tidy: never log raw secrets.
comment on table public.audit_logs is 'Security audit events. Service-role only; no client access.';
