-- 043_admin_subscriptions_and_coupons.sql
--
-- Admin Subscription & Promotions system (2026-10-07, owner-requested build):
--   1. subscriptions gains source (PAYMENT/ADMIN_GRANT/COUPON/TRIAL),
--      granted_by and grant_reason. One row per user stays the CURRENT state;
--      subscription_history is the append-only record of every change.
--   2. scheduled_plan_changes: admin grants that start AFTER the current
--      subscription ("one pending grant per user").
--   3. coupons + coupon_redemptions + payment_quotes: the promotion engine.
--      A quote is the server-trusted price for one checkout reference; the
--      payment provider is initialized with the quoted amount and the grant
--      at verification time must match the quote exactly (apply_quoted_payment).
--   4. effective_plan(p_user_id): THE source of truth for paid access. It
--      checks subscription status AND current_period_end, so an expired
--      subscription loses paid access even if no cron has run yet (the
--      pre-existing gap: quotas used to read subscriptions.plan directly).
--      A due SCHEDULED grant keeps access seamless until the sweep applies it.
--   5. The entitlements view and all three quota meters now use
--      effective_plan. Existing output columns are unchanged; two new ones
--      (subscription_expires_at, subscription_source) are appended.
--
-- Idempotent where possible. All new tables: RLS enabled, no policies
-- (service-role only, same posture as audit_logs / usage_lifetime).
-- Backward compatible: apply_verified_payment keeps its exact signature and
-- threshold mapping (only adds source + history rows).

-- ═════════════════════════════ 1. subscriptions ═════════════════════════════

alter table public.subscriptions
  add column if not exists source text not null default 'TRIAL'
    check (source in ('PAYMENT', 'ADMIN_GRANT', 'COUPON', 'TRIAL')),
  add column if not exists granted_by uuid references auth.users(id) on delete set null,
  add column if not exists grant_reason text;

-- ═════════════════════════ 2. subscription_history ══════════════════════════

create table if not exists public.subscription_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_plan public.plan_code,
  new_plan public.plan_code not null,
  old_status public.subscription_status,
  new_status public.subscription_status,
  source text not null,
  actor_id uuid,
  reason text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_subscription_history_user on public.subscription_history(user_id, created_at desc);
alter table public.subscription_history enable row level security;
comment on table public.subscription_history is 'Append-only record of every subscription change. Service-role only.';

-- ═══════════════════════ 3. scheduled_plan_changes ══════════════════════════

create table if not exists public.scheduled_plan_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan public.plan_code not null check (plan <> 'FREE'),
  duration_days int not null check (duration_days between 1 and 3650),
  source text not null default 'ADMIN_GRANT',
  granted_by uuid references auth.users(id) on delete set null,
  reason text,
  activate_at timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'APPLIED', 'CANCELLED')),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_scheduled_one_pending
  on public.scheduled_plan_changes(user_id) where status = 'SCHEDULED';
create index if not exists idx_scheduled_due
  on public.scheduled_plan_changes(status, activate_at);
alter table public.scheduled_plan_changes enable row level security;
comment on table public.scheduled_plan_changes is 'Admin grants queued to start after the current subscription expires. One pending grant per user. Service-role only.';

-- ═════════════════════════════ 4. coupons ═══════════════════════════════════

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text,
  discount_type text not null check (discount_type in ('PERCENTAGE', 'FIXED_AMOUNT')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  currency text not null default 'NGN',
  applicable_plans public.plan_code[] not null default '{}',
  min_purchase_amount numeric(12,2),
  max_discount_amount numeric(12,2),
  usage_limit int check (usage_limit is null or usage_limit > 0),
  usage_count int not null default 0,
  per_user_limit int not null default 1 check (per_user_limit between 1 and 1000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  alter table public.coupons add constraint coupons_code_unique unique (code);
exception when duplicate_object then null; end $$;
create index if not exists idx_coupons_active on public.coupons(is_active, expires_at);
alter table public.coupons enable row level security;
comment on table public.coupons is 'Promotion engine: percentage or fixed-amount discounts on selected plans. Service-role only (validation happens server-side).';

-- ═══════════════════════ 5. coupon_redemptions ══════════════════════════════

create table if not exists public.coupon_redemptions (
  id bigint generated always as identity primary key,
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_tx_ref text not null,
  plan public.plan_code not null,
  currency text not null,
  original_amount numeric(12,2) not null,
  discount_amount numeric(12,2) not null,
  final_amount numeric(12,2) not null,
  redeemed_at timestamptz not null default now()
);
alter table public.coupon_redemptions add constraint coupon_redemptions_txref_unique unique (payment_tx_ref);
create index if not exists idx_redemptions_coupon_user on public.coupon_redemptions(coupon_id, user_id);
create index if not exists idx_redemptions_coupon on public.coupon_redemptions(coupon_id);
alter table public.coupon_redemptions enable row level security;
comment on table public.coupon_redemptions is 'One row per completed (verified) payment that used a coupon. Unique on payment_tx_ref: one payment can never redeem twice. Service-role only.';

-- ═══════════════════════════ 6. payment_quotes ══════════════════════════════

create table if not exists public.payment_quotes (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan public.plan_code not null check (plan <> 'FREE'),
  currency text not null,
  original_amount numeric(12,2) not null,
  discount_amount numeric(12,2) not null default 0,
  final_amount numeric(12,2) not null,
  coupon_id uuid references public.coupons(id) on delete set null,
  coupon_code text,
  status text not null default 'QUOTED' check (status in ('QUOTED', 'CONSUMED', 'SUPERSEDED')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists idx_quotes_user on public.payment_quotes(user_id, created_at desc);
alter table public.payment_quotes enable row level security;
comment on table public.payment_quotes is 'Server-trusted checkout price per payment reference. The provider is initialized with final_amount; verification must match it exactly. Service-role only.';

-- ═════════════════════ 7. effective_plan (the truth) ════════════════════════

create or replace function public.effective_plan(p_user_id uuid) returns public.plan_code
language plpgsql stable security definer set search_path = public as $$
declare
  v_acct text;
  v_plan public.plan_code;
  v_status public.subscription_status;
  v_end timestamptz;
  v_sched public.plan_code;
begin
  select p.account_status into v_acct from public.profiles p where p.user_id = p_user_id;
  if v_acct is null or v_acct <> 'ACTIVE' then return 'FREE'; end if;

  select s.plan, s.status, s.current_period_end into v_plan, v_status, v_end
  from public.subscriptions s where s.user_id = p_user_id;
  if v_plan is null then return 'FREE'; end if;

  -- Active paid status AND not past the period end -> the row's plan.
  if v_status in ('ACTIVE_BASIC', 'ACTIVE_PREMIUM', 'ACTIVE_MAX')
     and (v_end is null or v_end > now()) then
    return v_plan;
  end if;

  -- Otherwise FREE, unless a scheduled grant is already due (seamless
  -- continuity between period end and the sweep that formalizes it).
  begin
    select c.plan into v_sched from public.scheduled_plan_changes c
      where c.user_id = p_user_id and c.status = 'SCHEDULED' and c.activate_at <= now()
      order by c.activate_at desc limit 1;
  exception when undefined_table then
    v_sched := null;
  end;
  return coalesce(v_sched, 'FREE');
end $$;

-- ═══════════════ 8. Entitlements view (expiry-aware; columns preserved) ══════

create or replace view public.v_workspace_entitlements as
select
  p.user_id,
  p.account_status,
  ep.plan_code as plan,
  s.status as subscription_status,
  s.trial_ends_at,
  s.current_period_end as subscription_expires_at,
  s.source as subscription_source,
  case when p.account_status = 'ACTIVE'
        and (ep.plan_code in ('PREMIUM','MAX')
             or (ep.plan_code = 'BASIC' and coalesce(l.auto_apply_used, 0) < 2))
       then true else false end as automation_enabled,
  greatest(0,
    case when ep.plan_code = 'FREE'
         then 3 - coalesce(l.docs_used, 0)
         else (case when ep.plan_code='MAX' then 20 when ep.plan_code='PREMIUM' then 10 else 3 end)
              - coalesce(u.ai_used, 0)
    end) as ai_credits_remaining,
  greatest(0,
    case when ep.plan_code = 'FREE' then 0
         when ep.plan_code = 'BASIC' then 2 - coalesce(l.auto_apply_used, 0)
         else (case when ep.plan_code='MAX' then 20 else 10 end) - coalesce(u.applications_used, 0)
    end) as applications_remaining,
  case when ep.plan_code='PREMIUM' or ep.plan_code='MAX' then null
       when ep.plan_code='BASIC' then greatest(0, 50 - coalesce(u.tools_used, 0))
       else greatest(0, 10 - coalesce(u.tools_used, 0)) end as tool_uses_remaining
from public.profiles p
cross join lateral public.effective_plan(p.user_id) as ep(plan_code)
left join public.subscriptions s on s.user_id = p.user_id
left join public.usage_daily u on u.user_id = p.user_id and u.day = current_date
left join public.usage_lifetime l on l.user_id = p.user_id;

-- ═══════════ 9. Quota meters become expiry-aware via effective_plan ═════════

create or replace function public.consume_ai_credit(p_user_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare lim int; used int; plan public.plan_code; life int;
begin
  plan := public.effective_plan(p_user_id);
  if plan = 'FREE' then
    insert into usage_lifetime(user_id) values(p_user_id) on conflict do nothing;
    select docs_used into life from usage_lifetime where user_id=p_user_id for update;
    if life >= 3 then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
    update usage_lifetime set docs_used = docs_used + 1 where user_id=p_user_id;
    return;
  end if;
  lim := case when plan='MAX' then 20 when plan='PREMIUM' then 10 else 3 end;
  insert into usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  select ai_used into used from usage_daily where user_id=p_user_id and day=current_date for update;
  if used >= lim then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
  update usage_daily set ai_used=ai_used+1 where user_id=p_user_id and day=current_date;
end $$;

create or replace function public.reserve_application_slot(p_user_id uuid,p_job_id uuid,p_email text) returns uuid language plpgsql security definer set search_path = public as $$
declare lim int; used int; plan public.plan_code; app_id uuid; idem text; life int;
begin
  plan := public.effective_plan(p_user_id);
  if plan = 'FREE' then raise exception 'AUTOMATION_NOT_ENTITLED'; end if;
  idem := p_user_id::text||':'||p_job_id::text;
  if plan = 'BASIC' then
    insert into usage_lifetime(user_id) values(p_user_id) on conflict do nothing;
    select auto_apply_used into life from usage_lifetime where user_id=p_user_id for update;
    if life >= 2 then raise exception 'APPLICATION_QUOTA_EXHAUSTED'; end if;
    select id into app_id from applications where idempotency_key=idem;
    if app_id is not null then return app_id; end if;
    insert into applications(user_id,job_id,email,idempotency_key) values(p_user_id,p_job_id,p_email,idem) returning id into app_id;
    update usage_lifetime set auto_apply_used = auto_apply_used + 1 where user_id=p_user_id;
    insert into agent_tasks(user_id,application_id,type,payload) values(p_user_id,app_id,'APPLICATION',jsonb_build_object('job_id',p_job_id));
    return app_id;
  end if;
  lim := case when plan='MAX' then 20 else 10 end;
  insert into usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  select applications_used into used from usage_daily where user_id=p_user_id and day=current_date for update;
  if used >= lim then raise exception 'APPLICATION_QUOTA_EXHAUSTED'; end if;
  select id into app_id from applications where idempotency_key=idem;
  if app_id is not null then return app_id; end if;
  insert into applications(user_id,job_id,email,idempotency_key) values(p_user_id,p_job_id,p_email,idem) returning id into app_id;
  update usage_daily set applications_used=applications_used+1 where user_id=p_user_id and day=current_date;
  insert into agent_tasks(user_id,application_id,type,payload) values(p_user_id,app_id,'APPLICATION',jsonb_build_object('job_id',p_job_id));
  return app_id;
end $$;

create or replace function public.consume_tool_use(p_user_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare lim int; used int; plan public.plan_code;
begin
  plan := public.effective_plan(p_user_id);
  lim := case when plan='PREMIUM' or plan='MAX' then null when plan='BASIC' then 50 else 10 end;
  insert into usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  if lim is not null then
    select tools_used into used from usage_daily where user_id=p_user_id and day=current_date for update;
    if used >= lim then raise exception 'TOOL_QUOTA_EXHAUSTED'; end if;
  end if;
  update usage_daily set tools_used=coalesce(tools_used,0)+1 where user_id=p_user_id and day=current_date;
end $$;

-- ══════ 10. apply_verified_payment: same signature + plan mapping, now with
--           source + history (legacy/no-quote path stays fully compatible) ══════

create or replace function public.apply_verified_payment(p_transaction_id text, p_tx_ref text, p_amount numeric, p_currency text, p_email text, p_provider text default 'flutterwave')
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; plan public.plan_code; v_old_plan public.plan_code; v_old_status public.subscription_status; v_status public.subscription_status;
begin
  select id into uid from auth.users where lower(email)=lower(p_email);
  if uid is null then raise exception 'USER_NOT_FOUND'; end if;
  select case
    when p_currency = 'USD' then (
      case when p_amount>=14.99 then 'MAX'::public.plan_code
           when p_amount>=7.99 then 'PREMIUM'::public.plan_code
           else 'BASIC'::public.plan_code end)
    else (
      case when p_amount>=20000 then 'MAX'::public.plan_code
           when p_amount>=10000 then 'PREMIUM'::public.plan_code
           else 'BASIC'::public.plan_code end)
    end into plan;
  select s.plan, s.status into v_old_plan, v_old_status from public.subscriptions s where s.user_id = uid;
  insert into public.payments(user_id,provider,transaction_id,tx_ref,amount,currency,status)
    values(uid, p_provider, p_transaction_id, p_tx_ref, p_amount, p_currency, 'successful')
    on conflict(transaction_id) do nothing;
  v_status := case when plan='MAX' then 'ACTIVE_MAX' when plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end::public.subscription_status;
  insert into public.subscriptions(user_id,plan,status,source,current_period_start,current_period_end,provider,provider_customer_id)
    values(uid, plan, v_status, 'PAYMENT', now(), now()+interval '30 days', p_provider, p_email)
    on conflict(user_id) do update set plan=excluded.plan, status=excluded.status, source='PAYMENT',
      granted_by=null, grant_reason=null, cancelled_at=null,
      current_period_start=now(), current_period_end=now()+interval '30 days', updated_at=now();
  insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, period_start, period_end)
    values (uid, v_old_plan, plan, v_old_status, v_status, 'PAYMENT', now(), now()+interval '30 days');
end $$;

-- ═════ 11. apply_quoted_payment: coupon-aware grant, atomic, idempotent ═════

create or replace function public.apply_quoted_payment(
  p_reference text, p_provider text, p_verified_amount numeric, p_verified_currency text, p_verified_email text
) returns public.plan_code
language plpgsql security definer set search_path = public as $$
declare
  v_quote public.payment_quotes%rowtype;
  v_email_uid uuid;
  v_old_plan public.plan_code;
  v_old_status public.subscription_status;
  v_status public.subscription_status;
begin
  select * into v_quote from public.payment_quotes where reference = p_reference for update;
  if not found then return null; end if;  -- caller falls back to the legacy threshold path

  -- The payer email must resolve to the SAME user the quote was issued to.
  select id into v_email_uid from auth.users where lower(email)=lower(p_verified_email);
  if v_email_uid is null or v_email_uid <> v_quote.user_id then
    raise exception 'QUOTE_USER_MISMATCH';
  end if;

  -- Idempotent replay: a consumed quote returns its plan without re-granting.
  if v_quote.status = 'CONSUMED' then return v_quote.plan; end if;

  -- The provider's verified amount must equal the server-trusted quote.
  if abs(v_quote.final_amount - p_verified_amount) > 0.01 then
    raise exception 'QUOTE_AMOUNT_MISMATCH';
  end if;
  if v_quote.currency <> p_verified_currency then
    raise exception 'QUOTE_CURRENCY_MISMATCH';
  end if;

  insert into public.payments(user_id,provider,transaction_id,tx_ref,amount,currency,status)
    values(v_quote.user_id, p_provider, p_reference, p_reference, p_verified_amount, p_verified_currency, 'successful')
    on conflict(transaction_id) do nothing;

  select s.plan, s.status into v_old_plan, v_old_status from public.subscriptions s where s.user_id = v_quote.user_id;
  v_status := case when v_quote.plan='MAX' then 'ACTIVE_MAX' when v_quote.plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end::public.subscription_status;
  insert into public.subscriptions(user_id,plan,status,source,current_period_start,current_period_end,provider,provider_customer_id)
    values(v_quote.user_id, v_quote.plan, v_status, 'PAYMENT', now(), now()+interval '30 days', p_provider, p_verified_email)
    on conflict(user_id) do update set plan=excluded.plan, status=excluded.status, source='PAYMENT',
      granted_by=null, grant_reason=null, cancelled_at=null,
      current_period_start=now(), current_period_end=now()+interval '30 days', updated_at=now();

  -- Coupon redemption: one row per payment (unique constraint), counted once.
  if v_quote.coupon_id is not null then
    if not exists (select 1 from public.coupon_redemptions where payment_tx_ref = p_reference) then
      insert into public.coupon_redemptions(coupon_id,user_id,payment_tx_ref,plan,currency,original_amount,discount_amount,final_amount)
        values(v_quote.coupon_id, v_quote.user_id, p_reference, v_quote.plan, v_quote.currency, v_quote.original_amount, v_quote.discount_amount, v_quote.final_amount);
      update public.coupons set usage_count = usage_count + 1, updated_at = now() where id = v_quote.coupon_id;
    end if;
  end if;

  insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, reason, period_start, period_end)
    values (v_quote.user_id, v_old_plan, v_quote.plan, v_old_status, v_status, 'PAYMENT',
            case when v_quote.coupon_id is not null then 'coupon ' || v_quote.coupon_code end,
            now(), now()+interval '30 days');

  update public.payment_quotes set status='CONSUMED', consumed_at=now() where reference = p_reference;
  return v_quote.plan;
end $$;

-- ═════ 12. admin_change_subscription: the audited admin grant primitive ═════

create or replace function public.admin_change_subscription(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_new_plan public.plan_code,
  p_duration_days int,
  p_start_mode text,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin_ok boolean;
  v_sub public.subscriptions%rowtype;
  v_old_plan public.plan_code;
  v_old_status public.subscription_status;
  v_effective public.plan_code;
  v_status public.subscription_status;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_activate_at timestamptz;
begin
  -- Belt-and-braces admin gate (the route already checks admin_users).
  select exists(select 1 from public.admin_users where user_id = p_admin_id) into v_admin_ok;
  if not v_admin_ok then raise exception 'FORBIDDEN'; end if;

  select * into v_sub from public.subscriptions where user_id = p_target_user_id for update;
  v_old_plan := coalesce(v_sub.plan, 'FREE');
  v_old_status := v_sub.status;
  v_effective := public.effective_plan(p_target_user_id);

  -- Return to FREE: cancel the period, drop any pending grant, keep history.
  if p_new_plan = 'FREE' then
    update public.scheduled_plan_changes set status='CANCELLED'
      where user_id = p_target_user_id and status = 'SCHEDULED';
    if v_sub.id is null then
      insert into public.subscriptions(user_id, plan, status, source, granted_by, grant_reason, cancelled_at, current_period_end)
      values (p_target_user_id, 'FREE', 'CANCELLED', 'ADMIN_GRANT', p_admin_id, p_reason, now(), now());
    else
      update public.subscriptions set plan='FREE', status='CANCELLED', cancelled_at=now(),
        current_period_end=now(), source='ADMIN_GRANT', granted_by=p_admin_id, grant_reason=p_reason, updated_at=now()
      where user_id = p_target_user_id;
    end if;
    insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, actor_id, reason, period_start, period_end)
      values (p_target_user_id, v_old_plan, 'FREE', v_old_status, 'CANCELLED', 'ADMIN_GRANT', p_admin_id, p_reason, v_sub.current_period_start, now());
    return jsonb_build_object('mode', 'applied', 'oldPlan', v_old_plan, 'newPlan', 'FREE',
      'status', 'CANCELLED', 'expiresAt', now());
  end if;

  if p_duration_days is null or p_duration_days < 1 or p_duration_days > 3650 then
    raise exception 'INVALID_DURATION';
  end if;
  if p_start_mode not in ('IMMEDIATELY', 'AFTER_CURRENT') then
    raise exception 'INVALID_START_MODE';
  end if;

  v_status := case when p_new_plan='MAX' then 'ACTIVE_MAX' when p_new_plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end::public.subscription_status;

  -- Queue after the current paid period (one pending grant; replaced if re-issued).
  if p_start_mode = 'AFTER_CURRENT' and v_effective <> 'FREE' then
    v_activate_at := greatest(coalesce(v_sub.current_period_end, now()), now());
    delete from public.scheduled_plan_changes where user_id = p_target_user_id and status = 'SCHEDULED';
    insert into public.scheduled_plan_changes(user_id, plan, duration_days, granted_by, reason, activate_at)
      values (p_target_user_id, p_new_plan, p_duration_days, p_admin_id, p_reason, v_activate_at);
    insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, actor_id, reason, period_start, period_end)
      values (p_target_user_id, v_old_plan, p_new_plan, v_old_status, v_status, 'ADMIN_GRANT_SCHEDULED', p_admin_id, p_reason,
              v_activate_at, v_activate_at + make_interval(days => p_duration_days));
    return jsonb_build_object('mode', 'scheduled', 'oldPlan', v_old_plan, 'newPlan', p_new_plan,
      'activateAt', v_activate_at, 'expiresAt', v_activate_at + make_interval(days => p_duration_days));
  end if;

  -- Apply now. Same plan + still active = true extension from the current end;
  -- otherwise the window restarts from now.
  if v_old_plan = p_new_plan and v_effective <> 'FREE'
     and v_sub.current_period_end is not null and v_sub.current_period_end > now() then
    v_period_start := v_sub.current_period_start;
    v_period_end := v_sub.current_period_end + make_interval(days => p_duration_days);
  else
    v_period_start := now();
    v_period_end := now() + make_interval(days => p_duration_days);
  end if;

  insert into public.subscriptions(user_id, plan, status, source, granted_by, grant_reason, current_period_start, current_period_end)
    values (p_target_user_id, p_new_plan, v_status, 'ADMIN_GRANT', p_admin_id, p_reason, v_period_start, v_period_end)
    on conflict(user_id) do update set plan=excluded.plan, status=excluded.status, source='ADMIN_GRANT',
      granted_by=excluded.granted_by, grant_reason=excluded.grant_reason, cancelled_at=null,
      current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end, updated_at=now();

  insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, actor_id, reason, period_start, period_end)
    values (p_target_user_id, v_old_plan, p_new_plan, v_old_status, v_status, 'ADMIN_GRANT', p_admin_id, p_reason, v_period_start, v_period_end);

  return jsonb_build_object('mode', 'applied', 'oldPlan', v_old_plan, 'newPlan', p_new_plan,
    'status', v_status, 'periodStart', v_period_start, 'expiresAt', v_period_end);
end $$;

-- ═════ 13. Daily sweeps (bookkeeping; access is already protected by
--            effective_plan, so a late sweep can never over-grant) ═════

create or replace function public.expire_due_subscriptions()
returns table(o_user_id uuid, o_plan public.plan_code)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id, plan, status, current_period_end from public.subscriptions
           where status in ('ACTIVE_BASIC','ACTIVE_PREMIUM','ACTIVE_MAX')
             and current_period_end is not null and current_period_end <= now()
           for update loop
    update public.subscriptions set status='EXPIRED', updated_at=now() where user_id = r.user_id;
    insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, period_start, period_end)
      values (r.user_id, r.plan, 'FREE', r.status, 'EXPIRED', 'EXPIRY', null, r.current_period_end);
    o_user_id := r.user_id; o_plan := r.plan;
    return next;
  end loop;
  return;
end $$;

create or replace function public.apply_due_scheduled_changes()
returns table(o_user_id uuid, o_plan public.plan_code)
language plpgsql security definer set search_path = public as $$
declare r record; v_old_plan public.plan_code; v_old_status public.subscription_status; v_status public.subscription_status;
begin
  for r in select * from public.scheduled_plan_changes
           where status='SCHEDULED' and activate_at <= now()
           order by activate_at
           for update skip locked loop
    select s.plan, s.status into v_old_plan, v_old_status from public.subscriptions s where s.user_id = r.user_id;
    v_status := case when r.plan='MAX' then 'ACTIVE_MAX' when r.plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end::public.subscription_status;
    insert into public.subscriptions(user_id, plan, status, source, granted_by, grant_reason, current_period_start, current_period_end)
      values (r.user_id, r.plan, v_status, 'ADMIN_GRANT', r.granted_by, r.reason, r.activate_at, r.activate_at + make_interval(days => r.duration_days))
      on conflict(user_id) do update set plan=excluded.plan, status=excluded.status, source='ADMIN_GRANT',
        granted_by=excluded.granted_by, grant_reason=excluded.grant_reason, cancelled_at=null,
        current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end, updated_at=now();
    update public.scheduled_plan_changes set status='APPLIED', applied_at=now() where id = r.id;
    insert into public.subscription_history(user_id, old_plan, new_plan, old_status, new_status, source, actor_id, reason, period_start, period_end)
      values (r.user_id, v_old_plan, r.plan, v_old_status, v_status, 'ADMIN_GRANT', r.granted_by, r.reason,
              r.activate_at, r.activate_at + make_interval(days => r.duration_days));
    o_user_id := r.user_id; o_plan := r.plan;
    return next;
  end loop;
  return;
end $$;
