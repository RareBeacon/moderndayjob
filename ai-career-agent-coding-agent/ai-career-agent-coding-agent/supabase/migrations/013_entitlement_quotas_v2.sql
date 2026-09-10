-- 013_entitlement_quotas_v2.sql
-- Quota model v2 (mirrors packages/shared/plans.ts and lib/billing/pricing.ts):
--  - FREE    : 3 AI documents LIFETIME (not daily), no auto-apply, 10 tool uses/day
--  - BASIC   : 3 AI documents/day, 2 auto-apply uses LIFETIME (trial), 50 tool uses/day
--  - PREMIUM : 10 AI documents/day, 10 auto-apply slots/day, unlimited tools
--  - MAX     : 20 AI documents/day, 20 auto-apply slots/day, unlimited tools
-- Agent mode (auto-apply) is a Premium/Max feature; Basic gets 2 trial uses.
-- There is no universal automation trial: TRIAL status alone grants nothing.
--
-- Self-sufficient from a 011-state database (repeats the 012 DDL additions
-- idempotently) and safe to re-run on a database that already has v2.

-- 1. Enums (idempotent) ------------------------------------------------------
alter type public.plan_code add value if not exists 'MAX';
alter type public.subscription_status add value if not exists 'ACTIVE_MAX';

-- 2. Plan rows (v2 quotas) ---------------------------------------------------
insert into public.subscription_plans (code, amount, currency, daily_ai_credits, daily_applications, flutterwave_plan_id) values
  ('FREE',    0,     'NGN', 0,  0,  null),
  ('BASIC',   5000,  'NGN', 3,  0,  null),
  ('PREMIUM', 10000, 'NGN', 10, 10, null),
  ('MAX',     20000, 'NGN', 20, 20, null)
on conflict (code) do update set
  amount = excluded.amount,
  daily_ai_credits = excluded.daily_ai_credits,
  daily_applications = excluded.daily_applications;

-- 3. Counters ----------------------------------------------------------------
alter table public.usage_daily
  add column if not exists tools_used int not null default 0;

-- Lifetime counters for the FREE document allowance (3 total) and the BASIC
-- auto-apply trial (2 total). RLS enabled with NO policies: deny-by-default,
-- service role (server) only — same pattern as public.audit_logs.
create table if not exists public.usage_lifetime (
  user_id uuid primary key references auth.users(id) on delete cascade,
  docs_used int not null default 0,
  auto_apply_used int not null default 0
);
alter table public.usage_lifetime enable row level security;
comment on table public.usage_lifetime is 'Lifetime quotas: FREE docs (cap 3) + BASIC auto-apply trial (cap 2). Service-role only.';

-- 4. Entitlements view (v2 quotas, no universal trial) -----------------------
create or replace view public.v_workspace_entitlements as
select
  p.user_id,
  p.account_status,
  coalesce(s.plan, 'FREE') as plan,
  s.status as subscription_status,
  s.trial_ends_at,
  case when p.account_status = 'ACTIVE'
        and (s.plan in ('PREMIUM','MAX')
             or (s.plan = 'BASIC' and coalesce(l.auto_apply_used, 0) < 2))
       then true else false end as automation_enabled,
  greatest(0,
    case when coalesce(s.plan, 'FREE') = 'FREE'
         then 3 - coalesce(l.docs_used, 0)
         else (case when s.plan='MAX' then 20 when s.plan='PREMIUM' then 10 else 3 end)
              - coalesce(u.ai_used, 0)
    end) as ai_credits_remaining,
  greatest(0,
    case when coalesce(s.plan, 'FREE') = 'FREE' then 0
         when s.plan = 'BASIC' then 2 - coalesce(l.auto_apply_used, 0)
         else (case when s.plan='MAX' then 20 else 10 end) - coalesce(u.applications_used, 0)
    end) as applications_remaining,
  case when s.plan='PREMIUM' or s.plan='MAX' then null
       when s.plan='BASIC' then greatest(0, 50 - coalesce(u.tools_used, 0))
       else greatest(0, 10 - coalesce(u.tools_used, 0)) end as tool_uses_remaining
from public.profiles p
left join public.subscriptions s on s.user_id = p.user_id
left join public.usage_daily u on u.user_id = p.user_id and u.day = current_date
left join public.usage_lifetime l on l.user_id = p.user_id;

-- 5. Document-credit meter (FREE = lifetime cap 3; paid = daily) -------------
create or replace function public.consume_ai_credit(p_user_id uuid) returns void language plpgsql security definer as $$
declare lim int; used int; plan public.plan_code; life int;
begin
  select coalesce(s.plan,'FREE') into plan from subscriptions s where s.user_id=p_user_id;
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

-- 6. Automation-slot meter (FREE = none; BASIC = 2 lifetime; P/M = daily) ----
create or replace function public.reserve_application_slot(p_user_id uuid,p_job_id uuid,p_email text) returns uuid language plpgsql security definer as $$
declare lim int; used int; plan public.plan_code; app_id uuid; idem text; life int;
begin
  select coalesce(s.plan,'FREE') into plan from subscriptions s where s.user_id=p_user_id;
  if plan='FREE' then raise exception 'AUTOMATION_NOT_ENTITLED'; end if;
  idem := p_user_id::text||':'||p_job_id::text;
  if plan='BASIC' then
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

-- 7. Free career-tool meter (unchanged: 10 / 50 / unlimited) -----------------
create or replace function public.consume_tool_use(p_user_id uuid) returns void language plpgsql security definer as $$
declare lim int; used int; plan public.plan_code;
begin
  select coalesce(s.plan,'FREE') into plan from subscriptions s where s.user_id=p_user_id;
  lim := case when plan='PREMIUM' or plan='MAX' then null when plan='BASIC' then 50 else 10 end;
  insert into usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  if lim is not null then
    select tools_used into used from usage_daily where user_id=p_user_id and day=current_date for update;
    if used >= lim then raise exception 'TOOL_QUOTA_EXHAUSTED'; end if;
  end if;
  update usage_daily set tools_used=coalesce(tools_used,0)+1 where user_id=p_user_id and day=current_date;
end $$;

-- 8. Payment → plan mapping (unchanged thresholds) ---------------------------
create or replace function public.apply_verified_payment(p_transaction_id text,p_tx_ref text,p_amount numeric,p_currency text,p_email text) returns void language plpgsql security definer as $$
declare uid uuid; plan public.plan_code;
begin
  select id into uid from auth.users where lower(email)=lower(p_email);
  if uid is null then raise exception 'USER_NOT_FOUND'; end if;
  select case when p_amount>=20000 then 'MAX'::plan_code when p_amount>=10000 then 'PREMIUM'::plan_code else 'BASIC'::plan_code end into plan;
  insert into payments(user_id,provider,transaction_id,tx_ref,amount,currency,status)
    values(uid,'flutterwave',p_transaction_id,p_tx_ref,p_amount,p_currency,'successful')
    on conflict(transaction_id) do nothing;
  insert into subscriptions(user_id,plan,status,current_period_start,current_period_end,provider,provider_customer_id)
    values(uid,plan,
      case when plan='MAX' then 'ACTIVE_MAX' when plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end,
      now(),now()+interval '30 days','flutterwave',p_email)
    on conflict(user_id) do update set plan=excluded.plan,status=excluded.status,
      current_period_start=now(),current_period_end=now()+interval '30 days',updated_at=now();
end $$;
