-- =============================================================================
-- Migration 059: Subscription Restructuring (Free / Basic / Premium / Ultra)
--                & Atomic Billing-Cycle Successful Application Usage Ledger
-- =============================================================================
-- Authoritative Plan Matrix:
--   * FREE    : ₦0 / $0 — existing Free document/tool allowances preserved
--               (3 lifetime AI writer docs / 5 monthly ledger doc credits,
--                10 free-tool uses/day, all 30 resume/CV templates + exports;
--                5 monthly auto-apply credits when card-verified).
--   * BASIC   : ₦5,000 / $3.99 per month — 30 successful job applications per
--               billing period, 3 AI generations/day (15 monthly doc credits),
--                50 tool uses/day.
--   * PREMIUM : ₦10,000 / $7.99 per month — 50 successful job applications per
--               billing period, 10 AI generations/day (30 monthly doc credits),
--               unlimited tool uses.
--   * ULTRA   : ₦20,000 / $14.99 per month (renamed from Max) — Unlimited
--               successful job applications per billing period (subject to
--               anti-abuse velocity guard, job-board ToS, deduplication, and
--               user approval settings), 20 AI generations/day (100 monthly
--               doc credits), unlimited tool uses.
--
-- Critical Counting Invariant:
--   * ONLY confirmed, successfully submitted, non-duplicate applications count
--     against monthly allowances. Failed, timed-out, CAPTCHA-stopped,
--     validation-blocked, rejected, withdrawn, or duplicate attempts NEVER
--     consume monthly quota.
-- =============================================================================

-- 1. Plan catalog schema & canonical 4-tier upsert ----------------------------
alter table public.subscription_plans
  add column if not exists monthly_successful_applications_limit int,
  add column if not exists is_unlimited_applications boolean not null default false;

insert into public.subscription_plans (
  code, amount, currency, amount_usd,
  daily_ai_credits, daily_applications,
  monthly_document_credits, monthly_auto_apply_credits,
  monthly_successful_applications_limit, is_unlimited_applications,
  portfolio_limit,
  flutterwave_plan_id
) values
  ('FREE',    0,     'NGN', 0.00,  0,  0,      5,   0,      0,    false, 1,  null),
  ('BASIC',   5000,  'NGN', 3.99,  3,  30,     15,  30,     30,   false, 5,  null),
  ('PREMIUM', 10000, 'NGN', 7.99,  10, 50,     30,  50,     50,   false, 10, null),
  ('ULTRA',   20000, 'NGN', 14.99, 20, 999999, 100, 999999, null, true,  26, null)
on conflict (code) do update set
  amount = excluded.amount,
  currency = excluded.currency,
  amount_usd = excluded.amount_usd,
  daily_ai_credits = excluded.daily_ai_credits,
  daily_applications = excluded.daily_applications,
  monthly_document_credits = excluded.monthly_document_credits,
  monthly_auto_apply_credits = excluded.monthly_auto_apply_credits,
  monthly_successful_applications_limit = excluded.monthly_successful_applications_limit,
  is_unlimited_applications = excluded.is_unlimited_applications,
  portfolio_limit = excluded.portfolio_limit;

-- Safely migrate any active/scheduled/quoted MAX records to ULTRA so there is
-- no 5th plan anywhere while preserving subscription_history audit records.
update public.subscriptions
   set plan = 'ULTRA'::public.plan_code,
       status = case
         when status = 'ACTIVE_MAX'::public.subscription_status then 'ACTIVE_ULTRA'::public.subscription_status
         else status
       end,
       updated_at = now()
 where plan = 'MAX'::public.plan_code
    or status = 'ACTIVE_MAX'::public.subscription_status;

do $$
begin
  if to_regclass('public.scheduled_plan_changes') is not null then
    update public.scheduled_plan_changes
       set plan = 'ULTRA'::public.plan_code
     where plan = 'MAX'::public.plan_code;
  end if;

  if to_regclass('public.payment_quotes') is not null then
    update public.payment_quotes
       set plan = 'ULTRA'::public.plan_code
     where plan = 'MAX'::public.plan_code
       and status = 'QUOTED';
  end if;

  if to_regclass('public.coupons') is not null then
    update public.coupons
       set applicable_plans = array_replace(applicable_plans, 'MAX'::public.plan_code, 'ULTRA'::public.plan_code),
           updated_at = now()
     where 'MAX'::public.plan_code = any(applicable_plans);
  end if;

  if to_regclass('public.credit_periods') is not null then
    update public.credit_periods
       set plan_code = 'ULTRA'
     where plan_code = 'MAX';
  end if;
end $$;

delete from public.subscription_plans where code = 'MAX'::public.plan_code;

-- 2. Effective plan resolution (normalizes any legacy MAX -> ULTRA) -----------
create or replace function public.effective_plan(p_user_id uuid)
returns public.plan_code
language plpgsql stable security definer set search_path = public as $$
declare
  v_acct text;
  v_plan public.plan_code;
  v_status public.subscription_status;
  v_end timestamptz;
  v_sched public.plan_code;
begin
  select p.account_status::text into v_acct
    from public.profiles p
   where p.user_id = p_user_id;
  if v_acct is null or v_acct <> 'ACTIVE' then
    return 'FREE'::public.plan_code;
  end if;

  select s.plan, s.status, s.current_period_end
    into v_plan, v_status, v_end
    from public.subscriptions s
   where s.user_id = p_user_id;

  if v_plan is not null
     and v_status in ('ACTIVE_BASIC', 'ACTIVE_PREMIUM', 'ACTIVE_ULTRA', 'ACTIVE_MAX')
     and (v_end is null or v_end > now()) then
    if v_plan = 'MAX'::public.plan_code then
      return 'ULTRA'::public.plan_code;
    end if;
    return v_plan;
  end if;

  begin
    select c.plan into v_sched
      from public.scheduled_plan_changes c
     where c.user_id = p_user_id
       and c.status = 'SCHEDULED'
       and c.activate_at <= now()
     order by c.activate_at desc
     limit 1;
  exception when undefined_table then
    v_sched := null;
  end;

  if v_sched = 'MAX'::public.plan_code then
    return 'ULTRA'::public.plan_code;
  end if;
  return coalesce(v_sched, 'FREE'::public.plan_code);
end $$;

-- 3. Authoritative Monthly Successful Application Usage Ledger ----------------
create table if not exists public.application_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  reference_key text not null,
  plan_code public.plan_code not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null check (status in ('RESERVED', 'SUBMITTED', 'RELEASED')),
  confirmation text,
  release_reason text,
  reserved_at timestamptz not null default now(),
  submitted_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reference_key)
);

create index if not exists idx_app_usage_ledger_user_period
  on public.application_usage_ledger (user_id, status, period_start, period_end);

create unique index if not exists idx_app_usage_ledger_unique_app_submitted
  on public.application_usage_ledger (user_id, application_id)
  where application_id is not null and status = 'SUBMITTED';

create unique index if not exists idx_app_usage_ledger_unique_job_submitted
  on public.application_usage_ledger (user_id, job_id)
  where job_id is not null and status = 'SUBMITTED';

alter table public.application_usage_ledger enable row level security;
revoke all on public.application_usage_ledger from anon, authenticated;
comment on table public.application_usage_ledger is
  'Authoritative billing-period ledger for job application submissions. Counts ONLY confirmed non-duplicate SUBMITTED applications against Basic (30) and Premium (50) monthly caps; Ultra is unlimited with anti-abuse rate protection.';

-- Resolve a user''s active billing cycle window + monthly successful-app rules.
create or replace function public.get_billing_cycle_window(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table(
  eff_plan public.plan_code,
  period_start timestamptz,
  period_end timestamptz,
  monthly_limit int,
  is_unlimited boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.plan_code;
  v_sub_start timestamptz;
  v_sub_end timestamptz;
  v_activated boolean := false;
begin
  v_plan := public.effective_plan(p_user_id);

  if v_plan in ('BASIC'::public.plan_code, 'PREMIUM'::public.plan_code, 'ULTRA'::public.plan_code) then
    select s.current_period_start, s.current_period_end
      into v_sub_start, v_sub_end
      from public.subscriptions s
     where s.user_id = p_user_id;

    period_start := coalesce(v_sub_start, date_trunc('month', p_now));
    period_end := coalesce(
      case when v_sub_end is not null and v_sub_end > period_start then v_sub_end else null end,
      period_start + interval '30 days'
    );
    eff_plan := v_plan;
    if v_plan = 'ULTRA'::public.plan_code then
      monthly_limit := null;
      is_unlimited := true;
    elsif v_plan = 'PREMIUM'::public.plan_code then
      monthly_limit := 50;
      is_unlimited := false;
    else
      monthly_limit := 30;
      is_unlimited := false;
    end if;
    return next;
    return;
  end if;

  -- FREE tier: calendar month window; 5 auto-apply slots if card-activated, else 0.
  eff_plan := 'FREE'::public.plan_code;
  period_start := date_trunc('month', p_now);
  period_end := date_trunc('month', p_now) + interval '1 month';
  if to_regclass('public.auto_apply_activations') is not null then
    select exists(
      select 1 from public.auto_apply_activations a
       where a.user_id = p_user_id and a.status = 'ACTIVE'
    ) into v_activated;
  end if;
  monthly_limit := case when v_activated then 5 else 0 end;
  is_unlimited := false;
  return next;
end $$;

-- Read-only summary of monthly successful applications in the current period.
create or replace function public.get_monthly_application_usage(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table(
  plan public.plan_code,
  period_start timestamptz,
  period_end timestamptz,
  submitted_count int,
  reserved_count int,
  monthly_limit int,
  remaining int,
  is_unlimited boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  w record;
  v_submitted int := 0;
  v_reserved int := 0;
begin
  select * into w from public.get_billing_cycle_window(p_user_id, p_now) limit 1;

  select
    count(*) filter (where l.status = 'SUBMITTED')::int,
    count(*) filter (where l.status = 'RESERVED' and l.reserved_at > p_now - interval '30 minutes')::int
    into v_submitted, v_reserved
    from public.application_usage_ledger l
   where l.user_id = p_user_id
     and coalesce(l.submitted_at, l.reserved_at) >= w.period_start
     and coalesce(l.submitted_at, l.reserved_at) < w.period_end;

  plan := w.eff_plan;
  period_start := w.period_start;
  period_end := w.period_end;
  submitted_count := coalesce(v_submitted, 0);
  reserved_count := coalesce(v_reserved, 0);
  monthly_limit := w.monthly_limit;
  is_unlimited := w.is_unlimited;
  if w.is_unlimited then
    remaining := 999999;
  else
    remaining := greatest(0, coalesce(w.monthly_limit, 0) - (coalesce(v_submitted, 0) + coalesce(v_reserved, 0)));
  end if;
  return next;
end $$;

-- Parse an optional UUID out of references formatted like "app:<uuid>:<task>"
create or replace function public.try_extract_app_uuid(p_reference text)
returns uuid
language plpgsql immutable as $$
declare
  v_part text;
begin
  if p_reference is null then return null; end if;
  if p_reference ~* '^app:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then
    v_part := split_part(p_reference, ':', 2);
    return v_part::uuid;
  end if;
  if p_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return p_reference::uuid;
  end if;
  return null;
exception when others then
  return null;
end $$;

-- Atomic hold before an automated submission attempt.
create or replace function public.reserve_monthly_application_allowance(
  p_user_id uuid,
  p_application_id uuid default null,
  p_job_id uuid default null,
  p_reference text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  w record;
  v_ref text;
  v_app_id uuid;
  v_job_id uuid;
  v_existing_status text;
  v_in_period int := 0;
  v_hourly int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('app_monthly:' || p_user_id::text));

  v_app_id := coalesce(p_application_id, public.try_extract_app_uuid(p_reference));
  v_job_id := p_job_id;
  if v_job_id is null and v_app_id is not null then
    select a.job_id into v_job_id from public.applications a where a.id = v_app_id and a.user_id = p_user_id;
  end if;
  v_ref := coalesce(nullif(btrim(p_reference), ''), coalesce('app:' || v_app_id::text, gen_random_uuid()::text));

  -- Release stale abandoned reservations (> 30m old) so worker crashes never leak quota.
  update public.application_usage_ledger
     set status = 'RELEASED',
         release_reason = 'STALE_RESERVATION_TIMEOUT',
         released_at = now(),
         updated_at = now()
   where user_id = p_user_id
     and status = 'RESERVED'
     and reserved_at <= now() - interval '30 minutes';

  -- Idempotent re-entry on the exact same reference.
  select l.status into v_existing_status
    from public.application_usage_ledger l
   where l.user_id = p_user_id and l.reference_key = v_ref;
  if v_existing_status in ('RESERVED', 'SUBMITTED') then
    return;
  end if;

  -- Duplicate protection: if this application or job was ALREADY submitted by
  -- this user, never charge or submit a duplicate.
  if v_app_id is not null and exists (
    select 1 from public.application_usage_ledger l
     where l.user_id = p_user_id and l.application_id = v_app_id and l.status = 'SUBMITTED'
  ) then
    return;
  end if;

  if v_job_id is not null and exists (
    select 1 from public.application_usage_ledger l
     where l.user_id = p_user_id and l.job_id = v_job_id and l.status = 'SUBMITTED'
  ) then
    raise exception 'DUPLICATE_JOB_APPLICATION';
  end if;

  select * into w from public.get_billing_cycle_window(p_user_id, now()) limit 1;

  if not w.is_unlimited and coalesce(w.monthly_limit, 0) <= 0 then
    raise exception 'CREDIT_EXHAUSTED';
  end if;

  -- Platform anti-abuse safety limit (applies to ALL plans including Ultra):
  -- max 25 automated submission attempts per hour per user.
  select count(*)::int into v_hourly
    from public.application_usage_ledger l
   where l.user_id = p_user_id
     and l.status in ('RESERVED', 'SUBMITTED')
     and l.reserved_at > now() - interval '1 hour';
  if v_hourly >= 25 then
    raise exception 'ANTI_ABUSE_RATE_LIMIT';
  end if;

  if not w.is_unlimited then
    select count(*)::int into v_in_period
      from public.application_usage_ledger l
     where l.user_id = p_user_id
       and l.status in ('RESERVED', 'SUBMITTED')
       and coalesce(l.submitted_at, l.reserved_at) >= w.period_start
       and coalesce(l.submitted_at, l.reserved_at) < w.period_end;

    if v_in_period >= w.monthly_limit then
      raise exception 'CREDIT_EXHAUSTED';
    end if;
  end if;

  insert into public.application_usage_ledger (
    user_id, application_id, job_id, reference_key,
    plan_code, period_start, period_end, status, reserved_at, updated_at
  ) values (
    p_user_id, v_app_id, v_job_id, v_ref,
    w.eff_plan, w.period_start, w.period_end, 'RESERVED', now(), now()
  )
  on conflict (user_id, reference_key) do update
    set status = 'RESERVED',
        application_id = coalesce(excluded.application_id, public.application_usage_ledger.application_id),
        job_id = coalesce(excluded.job_id, public.application_usage_ledger.job_id),
        plan_code = excluded.plan_code,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        release_reason = null,
        released_at = null,
        reserved_at = now(),
        updated_at = now()
  where public.application_usage_ledger.status = 'RELEASED';
end $$;

-- Commit ONLY when an application is confirmed SUBMITTED.
create or replace function public.commit_monthly_application_submission(
  p_user_id uuid,
  p_application_id uuid default null,
  p_job_id uuid default null,
  p_reference text default null,
  p_confirmation text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  w record;
  v_ref text;
  v_app_id uuid;
  v_job_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('app_monthly:' || p_user_id::text));

  v_app_id := coalesce(p_application_id, public.try_extract_app_uuid(p_reference));
  v_job_id := p_job_id;
  if v_job_id is null and v_app_id is not null then
    select a.job_id into v_job_id from public.applications a where a.id = v_app_id and a.user_id = p_user_id;
  end if;
  v_ref := coalesce(nullif(btrim(p_reference), ''), coalesce('app:' || v_app_id::text, gen_random_uuid()::text));

  -- Idempotent if already recorded as SUBMITTED for this app or job.
  if (v_app_id is not null and exists (
        select 1 from public.application_usage_ledger l
         where l.user_id = p_user_id and l.application_id = v_app_id and l.status = 'SUBMITTED'
      ))
     or (v_job_id is not null and exists (
        select 1 from public.application_usage_ledger l
         where l.user_id = p_user_id and l.job_id = v_job_id and l.status = 'SUBMITTED'
      )) then
    update public.application_usage_ledger
       set status = 'RELEASED',
           release_reason = 'DEDUP_ALREADY_SUBMITTED',
           released_at = now(),
           updated_at = now()
     where user_id = p_user_id
       and reference_key = v_ref
       and status = 'RESERVED';
    return;
  end if;

  update public.application_usage_ledger
     set status = 'SUBMITTED',
         application_id = coalesce(v_app_id, application_id),
         job_id = coalesce(v_job_id, job_id),
         confirmation = coalesce(p_confirmation, confirmation),
         submitted_at = coalesce(submitted_at, now()),
         updated_at = now()
   where user_id = p_user_id
     and reference_key = v_ref;

  if not found then
    select * into w from public.get_billing_cycle_window(p_user_id, now()) limit 1;
    insert into public.application_usage_ledger (
      user_id, application_id, job_id, reference_key,
      plan_code, period_start, period_end, status,
      confirmation, reserved_at, submitted_at, updated_at
    ) values (
      p_user_id, v_app_id, v_job_id, v_ref,
      w.eff_plan, w.period_start, w.period_end, 'SUBMITTED',
      p_confirmation, now(), now(), now()
    )
    on conflict (user_id, reference_key) do update
      set status = 'SUBMITTED',
          submitted_at = coalesce(public.application_usage_ledger.submitted_at, now()),
          confirmation = coalesce(excluded.confirmation, public.application_usage_ledger.confirmation),
          updated_at = now();
  end if;
end $$;

-- Release a reservation when submission fails, stops, times out, or errors.
create or replace function public.release_monthly_application_reservation(
  p_user_id uuid,
  p_application_id uuid default null,
  p_reference text default null,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ref text;
  v_app_id uuid;
begin
  v_app_id := coalesce(p_application_id, public.try_extract_app_uuid(p_reference));
  v_ref := nullif(btrim(p_reference), '');

  update public.application_usage_ledger
     set status = 'RELEASED',
         release_reason = coalesce(p_reason, 'SUBMISSION_NOT_COMPLETED'),
         released_at = now(),
         updated_at = now()
   where user_id = p_user_id
     and status = 'RESERVED'
     and (
       (v_ref is not null and reference_key = v_ref)
       or (v_ref is null and v_app_id is not null and application_id = v_app_id)
     );
end $$;

-- 4. Bridge credit_* RPCs for AUTO_APPLY to the authoritative monthly ledger --
create or replace function public.credit_available(p_user uuid, p_resource text)
returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  u record;
begin
  if p_resource = 'AUTO_APPLY' then
    select * into u from public.get_monthly_application_usage(p_user, now()) limit 1;
    return coalesce(u.remaining, 0);
  end if;

  return public.credit_balance(p_user, p_resource)
       - (select count(*)::int
          from public.credit_holds
          where user_id = p_user
            and resource_type = p_resource
            and released_at is null
            and consumed_at is null);
end $$;

create or replace function public.credit_reserve(p_user uuid, p_resource text, p_reference text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_resource = 'AUTO_APPLY' then
    perform public.reserve_monthly_application_allowance(p_user, null, null, p_reference);
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user::text || ':' || p_resource));
  if public.credit_available(p_user, p_resource) < 1 then
    raise exception 'CREDIT_EXHAUSTED';
  end if;
  insert into public.credit_holds (user_id, resource_type, reference)
  values (p_user, p_resource, p_reference)
  on conflict (user_id, resource_type, reference) do nothing;
end $$;

create or replace function public.credit_consume(
  p_user uuid, p_resource text, p_reference text, p_key text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_resource = 'AUTO_APPLY' then
    perform public.commit_monthly_application_submission(p_user, null, null, p_reference, null);
    insert into public.credit_ledger (user_id, resource_type, operation, delta, idempotency_key, reference)
    values (p_user, 'AUTO_APPLY', 'CONSUME', -1, p_key, p_reference)
    on conflict (idempotency_key) do nothing;
    return;
  end if;

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

create or replace function public.credit_release(
  p_user uuid, p_resource text, p_reference text, p_key text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_resource = 'AUTO_APPLY' then
    perform public.release_monthly_application_reservation(p_user, null, p_reference, 'CREDIT_RELEASED');
    insert into public.credit_ledger (user_id, resource_type, operation, delta, idempotency_key, reference)
    values (p_user, 'AUTO_APPLY', 'RELEASE', 0, p_key, p_reference)
    on conflict (idempotency_key) do nothing;
    return;
  end if;

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

-- 5. Updated quota meters, entitlements view & billing functions --------------
create or replace function public.consume_ai_credit(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare lim int; used int; plan public.plan_code; life int;
begin
  plan := public.effective_plan(p_user_id);
  if plan = 'FREE'::public.plan_code then
    insert into public.usage_lifetime(user_id) values(p_user_id) on conflict do nothing;
    select docs_used into life from public.usage_lifetime where user_id = p_user_id for update;
    if life >= 3 then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
    update public.usage_lifetime set docs_used = docs_used + 1 where user_id = p_user_id;
    return;
  end if;
  lim := case when plan in ('ULTRA'::public.plan_code, 'MAX'::public.plan_code) then 20
              when plan = 'PREMIUM'::public.plan_code then 10
              else 3 end;
  insert into public.usage_daily(user_id, day) values(p_user_id, current_date) on conflict do nothing;
  select ai_used into used from public.usage_daily where user_id = p_user_id and day = current_date for update;
  if used >= lim then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
  update public.usage_daily set ai_used = ai_used + 1 where user_id = p_user_id and day = current_date;
end $$;

create or replace function public.consume_tool_use(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare lim int; used int; plan public.plan_code;
begin
  plan := public.effective_plan(p_user_id);
  lim := case
    when plan in ('PREMIUM'::public.plan_code, 'ULTRA'::public.plan_code, 'MAX'::public.plan_code) then null
    when plan = 'BASIC'::public.plan_code then 50
    else 10
  end;
  insert into public.usage_daily(user_id, day) values(p_user_id, current_date) on conflict do nothing;
  if lim is not null then
    select tools_used into used from public.usage_daily where user_id = p_user_id and day = current_date for update;
    if used >= lim then raise exception 'TOOL_QUOTA_EXHAUSTED'; end if;
  end if;
  update public.usage_daily set tools_used = coalesce(tools_used, 0) + 1 where user_id = p_user_id and day = current_date;
end $$;

-- Queue an application task WITHOUT pre-charging monthly quota (quota is
-- charged ONLY when submission actually succeeds).
create or replace function public.reserve_application_slot(p_user_id uuid, p_job_id uuid, p_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u record;
  app_id uuid;
  idem text;
begin
  select * into u from public.get_monthly_application_usage(p_user_id, now()) limit 1;
  if u.plan = 'FREE'::public.plan_code and coalesce(u.monthly_limit, 0) <= 0 then
    raise exception 'AUTOMATION_NOT_ENTITLED';
  end if;
  if not u.is_unlimited and coalesce(u.remaining, 0) <= 0 then
    raise exception 'APPLICATION_QUOTA_EXHAUSTED';
  end if;

  idem := p_user_id::text || ':' || p_job_id::text;
  select id into app_id from public.applications where idempotency_key = idem;
  if app_id is not null then return app_id; end if;

  insert into public.applications(user_id, job_id, email, idempotency_key)
  values (p_user_id, p_job_id, p_email, idem)
  returning id into app_id;

  insert into public.agent_tasks(user_id, application_id, type, payload)
  values (p_user_id, app_id, 'APPLICATION', jsonb_build_object('job_id', p_job_id));

  return app_id;
end $$;

-- Entitlements view: preserves existing columns 1..11 in exact order and
-- appends billing-period monthly application counters at positions 12..15.
create or replace view public.v_workspace_entitlements as
select
  p.user_id,
  p.account_status,
  ep.plan_code as plan,
  s.status as subscription_status,
  s.trial_ends_at,
  case
    when p.account_status = 'ACTIVE'
         and (ep.plan_code in ('BASIC'::public.plan_code, 'PREMIUM'::public.plan_code, 'ULTRA'::public.plan_code)
              or coalesce(mau.monthly_limit, 0) > 0)
    then true else false
  end as automation_enabled,
  greatest(0,
    case when ep.plan_code = 'FREE'::public.plan_code
         then 3 - coalesce(l.docs_used, 0)
         else (case when ep.plan_code = 'ULTRA'::public.plan_code then 20
                    when ep.plan_code = 'PREMIUM'::public.plan_code then 10
                    else 3 end) - coalesce(u.ai_used, 0)
    end) as ai_credits_remaining,
  coalesce(mau.remaining, 0) as applications_remaining,
  case
    when ep.plan_code in ('PREMIUM'::public.plan_code, 'ULTRA'::public.plan_code) then null
    when ep.plan_code = 'BASIC'::public.plan_code then greatest(0, 50 - coalesce(u.tools_used, 0))
    else greatest(0, 10 - coalesce(u.tools_used, 0))
  end as tool_uses_remaining,
  s.current_period_end as subscription_expires_at,
  s.source as subscription_source,
  coalesce(mau.submitted_count, 0) as applications_used_this_period,
  mau.monthly_limit as applications_monthly_limit,
  coalesce(mau.is_unlimited, false) as applications_unlimited,
  mau.period_start as billing_period_start
from public.profiles p
cross join lateral public.effective_plan(p.user_id) as ep(plan_code)
cross join lateral public.get_monthly_application_usage(p.user_id, now()) as mau
left join public.subscriptions s on s.user_id = p.user_id
left join public.usage_daily u on u.user_id = p.user_id and u.day = current_date
left join public.usage_lifetime l on l.user_id = p.user_id;

-- Payment verification -> ULTRA (₦20,000 / $14.99), PREMIUM (₦10,000 / $7.99), BASIC (₦5,000 / $3.99)
create or replace function public.apply_verified_payment(
  p_transaction_id text,
  p_tx_ref text,
  p_amount numeric,
  p_currency text,
  p_email text,
  p_provider text default 'flutterwave'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  plan public.plan_code;
  v_old_plan public.plan_code;
  v_old_status public.subscription_status;
  v_status public.subscription_status;
  v_inserted int := 0;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'USER_NOT_FOUND'; end if;

  select case
    when p_currency = 'USD' then (
      case when p_amount >= 14.99 then 'ULTRA'::public.plan_code
           when p_amount >= 7.99  then 'PREMIUM'::public.plan_code
           else 'BASIC'::public.plan_code end)
    else (
      case when p_amount >= 20000 then 'ULTRA'::public.plan_code
           when p_amount >= 10000 then 'PREMIUM'::public.plan_code
           else 'BASIC'::public.plan_code end)
  end into plan;

  insert into public.payments(user_id, provider, transaction_id, tx_ref, amount, currency, status)
    values (uid, p_provider, p_transaction_id, p_tx_ref, p_amount, p_currency, 'successful')
    on conflict (transaction_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- True replay guard: if this exact transaction_id was already applied, do not
  -- reset current_period_end or append a duplicate subscription_history row.
  if v_inserted = 0 then
    return;
  end if;

  select s.plan, s.status into v_old_plan, v_old_status from public.subscriptions s where s.user_id = uid;
  v_status := case
    when plan = 'ULTRA'::public.plan_code then 'ACTIVE_ULTRA'
    when plan = 'PREMIUM'::public.plan_code then 'ACTIVE_PREMIUM'
    else 'ACTIVE_BASIC'
  end::public.subscription_status;

  insert into public.subscriptions(user_id, plan, status, source, current_period_start, current_period_end, provider, provider_customer_id)
    values (uid, plan, v_status, 'PAYMENT', now(), now() + interval '30 days', p_provider, p_email)
    on conflict (user_id) do update set
      plan = excluded.plan,
      status = excluded.status,
      source = 'PAYMENT',
      granted_by = null,
      grant_reason = null,
      cancelled_at = null,
      current_period_start = now(),
      current_period_end = now() + interval '30 days',
      updated_at = now();

  insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, period_start, period_end)
    values (uid, v_old_plan, plan, v_old_status, v_status, 'PAYMENT', now(), now() + interval '30 days');
end $$;

create or replace function public.apply_quoted_payment(
  p_reference text,
  p_provider text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_verified_email text
) returns public.plan_code
language plpgsql security definer set search_path = public as $$
declare
  v_quote public.payment_quotes%rowtype;
  v_email_uid uuid;
  v_grant_plan public.plan_code;
  v_old_plan public.plan_code;
  v_old_status public.subscription_status;
  v_status public.subscription_status;
begin
  select * into v_quote from public.payment_quotes where reference = p_reference for update;
  if not found then return null; end if;

  select id into v_email_uid from auth.users where lower(email) = lower(p_verified_email);
  if v_email_uid is null or v_email_uid <> v_quote.user_id then
    raise exception 'QUOTE_USER_MISMATCH';
  end if;

  v_grant_plan := case
    when v_quote.plan = 'MAX'::public.plan_code then 'ULTRA'::public.plan_code
    else v_quote.plan
  end;

  if v_quote.status = 'CONSUMED' then return v_grant_plan; end if;

  if abs(v_quote.final_amount - p_verified_amount) > 0.01 then
    raise exception 'QUOTE_AMOUNT_MISMATCH';
  end if;
  if v_quote.currency <> p_verified_currency then
    raise exception 'QUOTE_CURRENCY_MISMATCH';
  end if;

  insert into public.payments(user_id, provider, transaction_id, tx_ref, amount, currency, status)
    values (v_quote.user_id, p_provider, p_reference, p_reference, p_verified_amount, p_verified_currency, 'successful')
    on conflict (transaction_id) do nothing;

  select s.plan, s.status into v_old_plan, v_old_status from public.subscriptions s where s.user_id = v_quote.user_id;
  v_status := case
    when v_grant_plan = 'ULTRA'::public.plan_code then 'ACTIVE_ULTRA'
    when v_grant_plan = 'PREMIUM'::public.plan_code then 'ACTIVE_PREMIUM'
    else 'ACTIVE_BASIC'
  end::public.subscription_status;

  insert into public.subscriptions(user_id, plan, status, source, current_period_start, current_period_end, provider, provider_customer_id)
    values (v_quote.user_id, v_grant_plan, v_status, 'PAYMENT', now(), now() + interval '30 days', p_provider, p_verified_email)
    on conflict (user_id) do update set
      plan = excluded.plan,
      status = excluded.status,
      source = 'PAYMENT',
      granted_by = null,
      grant_reason = null,
      cancelled_at = null,
      current_period_start = now(),
      current_period_end = now() + interval '30 days',
      updated_at = now();

  if v_quote.coupon_id is not null then
    if not exists (select 1 from public.coupon_redemptions where payment_tx_ref = p_reference) then
      insert into public.coupon_redemptions(coupon_id, user_id, payment_tx_ref, plan, currency, original_amount, discount_amount, final_amount)
        values (v_quote.coupon_id, v_quote.user_id, p_reference, v_grant_plan, v_quote.currency, v_quote.original_amount, v_quote.discount_amount, v_quote.final_amount);
      update public.coupons set usage_count = usage_count + 1, updated_at = now() where id = v_quote.coupon_id;
    end if;
  end if;

  insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, reason, period_start, period_end)
    values (v_quote.user_id, v_old_plan, v_grant_plan, v_old_status, v_status, 'PAYMENT',
            case when v_quote.coupon_id is not null then 'coupon ' || v_quote.coupon_code end,
            now(), now() + interval '30 days');

  update public.payment_quotes set status = 'CONSUMED', consumed_at = now(), plan = v_grant_plan where reference = p_reference;
  return v_grant_plan;
end $$;

create or replace function public.expire_due_subscriptions()
returns table(o_user_id uuid, o_plan public.plan_code)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select user_id, plan, status, current_period_end
      from public.subscriptions
     where status in ('ACTIVE_BASIC', 'ACTIVE_PREMIUM', 'ACTIVE_ULTRA', 'ACTIVE_MAX')
       and current_period_end is not null
       and current_period_end <= now()
       for update
  loop
    update public.subscriptions set status = 'EXPIRED', updated_at = now() where user_id = r.user_id;
    insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, period_start, period_end)
      values (r.user_id, r.plan, 'FREE', r.status, 'EXPIRED', 'EXPIRY', null, r.current_period_end);
    o_user_id := r.user_id;
    o_plan := case when r.plan = 'MAX'::public.plan_code then 'ULTRA'::public.plan_code else r.plan end;
    return next;
  end loop;
  return;
end $$;

create or replace function public.apply_due_scheduled_changes()
returns table(o_user_id uuid, o_plan public.plan_code)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_plan public.plan_code;
  v_old_plan public.plan_code;
  v_old_status public.subscription_status;
  v_status public.subscription_status;
begin
  for r in
    select * from public.scheduled_plan_changes
     where status = 'SCHEDULED' and activate_at <= now()
     order by activate_at
       for update skip locked
  loop
    v_plan := case when r.plan = 'MAX'::public.plan_code then 'ULTRA'::public.plan_code else r.plan end;
    select s.plan, s.status into v_old_plan, v_old_status from public.subscriptions s where s.user_id = r.user_id;
    v_status := case
      when v_plan = 'ULTRA'::public.plan_code then 'ACTIVE_ULTRA'
      when v_plan = 'PREMIUM'::public.plan_code then 'ACTIVE_PREMIUM'
      else 'ACTIVE_BASIC'
    end::public.subscription_status;

    insert into public.subscriptions(user_id, plan, status, source, granted_by, grant_reason, current_period_start, current_period_end)
      values (r.user_id, v_plan, v_status, 'ADMIN_GRANT', r.granted_by, r.reason, r.activate_at, r.activate_at + make_interval(days => r.duration_days))
      on conflict (user_id) do update set
        plan = excluded.plan,
        status = excluded.status,
        source = 'ADMIN_GRANT',
        granted_by = excluded.granted_by,
        grant_reason = excluded.grant_reason,
        cancelled_at = null,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        updated_at = now();

    update public.scheduled_plan_changes set status = 'APPLIED', applied_at = now(), plan = v_plan where id = r.id;
    insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, actor_id, reason, period_start, period_end)
      values (r.user_id, v_old_plan, v_plan, v_old_status, v_status, 'ADMIN_GRANT', r.granted_by, r.reason,
              r.activate_at, r.activate_at + make_interval(days => r.duration_days));
    o_user_id := r.user_id;
    o_plan := v_plan;
    return next;
  end loop;
  return;
end $$;

create or replace function public.credit_ensure_user_period_grants(
  p_user uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_acct text;
  v_eff_plan text;
  v_sub_start timestamptz;
  v_sub_end timestamptz;
  v_sched_end timestamptz;
  v_period_start date;
  v_period_end date;
  v_period_id uuid;
  v_docs int;
  v_apps int;
  v_doc_key text;
  v_app_key text;
  v_granted int := 0;
begin
  if to_regclass('public.credit_periods') is null then
    return 0;
  end if;

  select p.account_status::text into v_acct from public.profiles p where p.user_id = p_user;
  if v_acct is null or v_acct <> 'ACTIVE' then
    return 0;
  end if;

  select s.current_period_start, s.current_period_end
    into v_sub_start, v_sub_end
    from public.subscriptions s
   where s.user_id = p_user;

  v_eff_plan := coalesce(public.effective_plan(p_user)::text, 'FREE');
  if v_eff_plan = 'MAX' then v_eff_plan := 'ULTRA'; end if;

  if v_eff_plan in ('BASIC', 'PREMIUM', 'ULTRA') then
    begin
      select c.activate_at + make_interval(days => c.duration_days)
        into v_sched_end
        from public.scheduled_plan_changes c
       where c.user_id = p_user
         and c.status = 'SCHEDULED'
         and c.activate_at <= p_now
       order by c.activate_at desc
       limit 1;
    exception when undefined_table then
      v_sched_end := null;
    end;

    v_period_start := coalesce(v_sub_start, date_trunc('month', p_now))::date;
    v_period_end := coalesce(
      case when v_sub_end is not null and v_sub_end > p_now then v_sub_end else null end,
      v_sched_end,
      p_now + interval '30 days'
    )::date;
    if v_period_end <= v_period_start then
      v_period_end := (v_period_start + interval '30 days')::date;
    end if;

    insert into public.credit_periods (user_id, kind, starts_at, ends_at, plan_code)
    values (p_user, 'SUBSCRIPTION', v_period_start, v_period_end, v_eff_plan)
    on conflict (user_id, kind, starts_at)
    do update set plan_code = excluded.plan_code, ends_at = excluded.ends_at
    returning id into v_period_id;

    select monthly_document_credits, monthly_auto_apply_credits
      into v_docs, v_apps
      from public.subscription_plans
     where code::text = v_eff_plan;

    v_doc_key := 'grant:' || p_user::text || ':DOCUMENT:' || v_period_id::text || ':' || v_eff_plan;
    v_app_key := 'grant:' || p_user::text || ':AUTO_APPLY:' || v_period_id::text || ':' || v_eff_plan;
  else
    v_period_start := date_trunc('month', p_now)::date;
    v_period_end := (date_trunc('month', p_now) + interval '1 month')::date;

    insert into public.credit_periods (user_id, kind, starts_at, ends_at, plan_code)
    values (p_user, 'CALENDAR', v_period_start, v_period_end, 'FREE')
    on conflict (user_id, kind, starts_at)
    do update set plan_code = 'FREE'
    returning id into v_period_id;

    v_docs := 5;
    if to_regclass('public.auto_apply_activations') is not null then
      select coalesce((
        select 5 from public.auto_apply_activations a
        where a.user_id = p_user and a.status = 'ACTIVE'
        limit 1
      ), 0) into v_apps;
    else
      v_apps := 0;
    end if;

    v_doc_key := 'grant:' || p_user::text || ':DOCUMENT:' || v_period_id::text;
    v_app_key := 'grant:' || p_user::text || ':AUTO_APPLY:' || v_period_id::text;
  end if;

  if v_docs is not null and v_docs > 0
     and public.credit_grant(p_user, 'DOCUMENT', v_docs, v_period_id, v_doc_key, 'period-grant') then
    v_granted := v_granted + 1;
  end if;

  if v_apps is not null and v_apps > 0 and v_apps < 999999
     and public.credit_grant(p_user, 'AUTO_APPLY', v_apps, v_period_id, v_app_key, 'period-grant') then
    v_granted := v_granted + 1;
  end if;

  return v_granted;
end $$;
