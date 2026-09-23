-- 037: credit ledger (Enterprise upgrade Milestone 2, owner decisions D1-D4).
--
-- Model (docs/upgrade/03-target-architecture.md section 2.1, amended by the
-- owner's 2026-09-23 answers):
--  * Append-only credit_ledger: every GRANT / CONSUME / RELEASE / ADJUST is
--    a row with a unique idempotency_key. Credits NEVER expire (there is no
--    EXPIRE operation) and each period's grant ADDS to the running balance.
--  * credit_holds: one open hold per (user, resource, reference) while an
--    operation is in flight; CONSUME closes it, RELEASE cancels it. Available
--    = balance minus open holds, so a held credit cannot be double-spent.
--  * credit_periods: grant attribution. CALENDAR months for free users,
--    SUBSCRIPTION billing periods (subscriptions.current_period_*) for paid
--    users, per decision D1.
--  * Plan matrix (D1): documents 5 / 10 / 15 / 100 (Max is a disclosed
--    fair-use cap, never a bare "unlimited"); auto-apply 0 (5 after the M3
--    activation flow) / 20 / 30 / 50 per period.
--  * Parallel-run design: nothing enforces the ledger until
--    ENTITLEMENTS_LEDGER=true; the daily pipeline populates grants so the
--    ledger can be observed for a clean cycle before enforcement flips.

alter table public.subscription_plans
  add column if not exists monthly_document_credits int not null default 5;
alter table public.subscription_plans
  add column if not exists monthly_auto_apply_credits int not null default 0;

update public.subscription_plans set monthly_document_credits = 5,   monthly_auto_apply_credits = 0  where code = 'FREE';
update public.subscription_plans set monthly_document_credits = 10,  monthly_auto_apply_credits = 20 where code = 'BASIC';
update public.subscription_plans set monthly_document_credits = 15,  monthly_auto_apply_credits = 30 where code = 'PREMIUM';
update public.subscription_plans set monthly_document_credits = 100, monthly_auto_apply_credits = 50 where code = 'MAX';

create table if not exists public.credit_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('CALENDAR', 'SUBSCRIPTION')),
  starts_at date not null,
  ends_at date not null,
  plan_code text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, starts_at)
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('DOCUMENT', 'AUTO_APPLY')),
  operation text not null check (operation in ('GRANT', 'CONSUME', 'RELEASE', 'ADJUST')),
  delta int not null,
  period_id uuid references public.credit_periods(id),
  idempotency_key text not null unique,
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('DOCUMENT', 'AUTO_APPLY')),
  reference text not null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz,
  unique (user_id, resource_type, reference),
  constraint holds_closed_once check (released_at is null or consumed_at is null)
);

alter table public.credit_periods enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_holds enable row level security;
-- No policies: service-role only (same pattern as migration 027).

-- Running balance: grants and adjustments in, consumptions out. Holds are
-- tracked separately so a reservation never mutates the ledger.
create or replace function public.credit_balance(p_user uuid, p_resource text)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)
  from public.credit_ledger
  where user_id = p_user
    and resource_type = p_resource
    and operation in ('GRANT', 'ADJUST', 'CONSUME');
$$;

-- Spendable now: balance minus open holds.
create or replace function public.credit_available(p_user uuid, p_resource text)
returns integer
language sql stable security definer set search_path = public as $$
  select public.credit_balance(p_user, p_resource)
       - (select count(*)
          from public.credit_holds
          where user_id = p_user
            and resource_type = p_resource
            and released_at is null
            and consumed_at is null);
$$;

-- Idempotent grant: returns true when a new grant row was inserted.
create or replace function public.credit_grant(
  p_user uuid, p_resource text, p_amount int, p_period uuid,
  p_key text, p_reference text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount <= 0 then return false; end if;
  insert into public.credit_ledger (user_id, resource_type, operation, delta, period_id, idempotency_key, reference)
  values (p_user, p_resource, 'GRANT', p_amount, p_period, p_key, p_reference)
  on conflict (idempotency_key) do nothing;
  return found;
end $$;

-- Hold one credit for an in-flight operation (decision D3: reserve at start).
-- Raises CREDIT_EXHAUSTED when nothing is available. Idempotent per reference.
create or replace function public.credit_reserve(p_user uuid, p_resource text, p_reference text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || ':' || p_resource));
  if public.credit_available(p_user, p_resource) < 1 then
    raise exception 'CREDIT_EXHAUSTED';
  end if;
  insert into public.credit_holds (user_id, resource_type, reference)
  values (p_user, p_resource, p_reference)
  on conflict (user_id, resource_type, reference) do nothing;
end $$;

-- Consume the held credit (decision D3: consume on confirmed completion).
-- Idempotent by key; closes the matching open hold when present.
create or replace function public.credit_consume(
  p_user uuid, p_resource text, p_reference text, p_key text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || ':' || p_resource));
  update public.credit_holds
     set consumed_at = now()
   where user_id = p_user
     and resource_type = p_resource
     and reference = p_reference
     and released_at is null
     and consumed_at is null;
  if not found and public.credit_available(p_user, p_resource) < 1 then
    raise exception 'CREDIT_EXHAUSTED';
  end if;
  insert into public.credit_ledger (user_id, resource_type, operation, delta, idempotency_key, reference)
  values (p_user, p_resource, 'CONSUME', -1, p_key, p_reference)
  on conflict (idempotency_key) do nothing;
end $$;

-- Release a hold without consuming (decision D3: release on failure or
-- cancellation). Writes a zero-delta RELEASE row for the audit trail.
create or replace function public.credit_release(
  p_user uuid, p_resource text, p_reference text, p_key text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.credit_holds
     set released_at = now()
   where user_id = p_user
     and resource_type = p_resource
     and reference = p_reference
     and released_at is null
     and consumed_at is null;
  insert into public.credit_ledger (user_id, resource_type, operation, delta, idempotency_key, reference)
  values (p_user, p_resource, 'RELEASE', 0, p_key, p_reference)
  on conflict (idempotency_key) do nothing;
end $$;

-- Period grants, run daily by the pipeline (idempotent, safe to re-run).
-- Paid users with a live billing period get that period's allowance keyed
-- to the period id (renewal = new period = new grant). Everyone else gets
-- the free calendar-month grant. FREE auto-apply stays zero until the M3
-- activation flow exists.
create or replace function public.credit_ensure_period_grants(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  period_id uuid;
  docs int;
  apps int;
  granted int := 0;
begin
  for rec in
    select p.user_id, s.plan as sub_plan, s.current_period_start, s.current_period_end
    from public.profiles p
    left join public.subscriptions s on s.user_id = p.user_id
  loop
    if rec.current_period_end is not null and rec.current_period_end > p_now then
      insert into public.credit_periods (user_id, kind, starts_at, ends_at, plan_code)
      values (rec.user_id, 'SUBSCRIPTION', rec.current_period_start::date, rec.current_period_end::date, rec.sub_plan::text)
      on conflict (user_id, kind, starts_at) do update set plan_code = excluded.plan_code, ends_at = excluded.ends_at
      returning id into period_id;
      select monthly_document_credits, monthly_auto_apply_credits into docs, apps
      from public.subscription_plans where code = rec.sub_plan;
    else
      insert into public.credit_periods (user_id, kind, starts_at, ends_at, plan_code)
      values (rec.user_id, 'CALENDAR', date_trunc('month', p_now)::date, (date_trunc('month', p_now) + interval '1 month')::date, 'FREE')
      on conflict (user_id, kind, starts_at) do update set plan_code = 'FREE'
      returning id into period_id;
      docs := 5;
      apps := 0;
    end if;

    if docs is not null and docs > 0
       and public.credit_grant(rec.user_id, 'DOCUMENT', docs, period_id,
            'grant:' || rec.user_id || ':DOCUMENT:' || period_id::text, 'period-grant') then
      granted := granted + 1;
    end if;
    if apps is not null and apps > 0
       and public.credit_grant(rec.user_id, 'AUTO_APPLY', apps, period_id,
            'grant:' || rec.user_id || ':AUTO_APPLY:' || period_id::text, 'period-grant') then
      granted := granted + 1;
    end if;
  end loop;
  return granted;
end $$;
