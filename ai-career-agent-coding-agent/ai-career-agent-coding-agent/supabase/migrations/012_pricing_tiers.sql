-- 012_pricing_tiers.sql
-- Four-tier pricing: FREE / BASIC (₦5,000) / PREMIUM (₦10,000) / MAX (₦20,000).
-- Mirrors packages/shared/plans.ts and lib/billing/pricing.ts.
--  - daily_ai_credits  → document generations (resume / cover letter / answers)
--  - daily_applications→ auto-apply automation slots
--  - tools_used        → free career-tool uses (FREE 10/day, BASIC 50/day,
--                        PREMIUM/MAX unlimited)

-- 1. Extend enums ------------------------------------------------------------
alter type public.plan_code add value if not exists 'MAX';
alter type public.subscription_status add value if not exists 'ACTIVE_MAX';

-- 2. Plan rows ---------------------------------------------------------------
insert into public.subscription_plans (code, amount, currency, daily_ai_credits, daily_applications, flutterwave_plan_id) values
  ('FREE',    0,     'NGN', 3,  0,  null),
  ('BASIC',   5000,  'NGN', 10, 10, null),
  ('PREMIUM', 10000, 'NGN', 20, 20, null),
  ('MAX',     20000, 'NGN', 40, 40, null)
on conflict (code) do update set
  amount = excluded.amount,
  daily_ai_credits = excluded.daily_ai_credits,
  daily_applications = excluded.daily_applications;

-- 3. Tool-usage counter ------------------------------------------------------
alter table public.usage_daily
  add column if not exists tools_used int not null default 0;

-- 4. Entitlements view (rewritten for the new quotas) ------------------------
create or replace view public.v_workspace_entitlements as
select
  p.user_id,
  p.account_status,
  coalesce(s.plan, 'FREE') as plan,
  s.status as subscription_status,
  s.trial_ends_at,
  case when p.account_status = 'ACTIVE'
        and (s.plan in ('BASIC','PREMIUM','MAX') or (s.status='TRIAL' and s.trial_ends_at > now()))
       then true else false end as automation_enabled,
  greatest(0, (
    case when s.plan='MAX' then 40 when s.plan='PREMIUM' then 20 when s.plan='BASIC' then 10 else 3 end
  ) - coalesce(u.ai_used, 0)) as ai_credits_remaining,
  greatest(0, (
    case when s.plan='MAX' then 40 when s.plan='PREMIUM' then 20 when s.plan='BASIC' then 10 else 0 end
  ) - coalesce(u.applications_used, 0)) as applications_remaining,
  case when s.plan='PREMIUM' or s.plan='MAX' then null
       when s.plan='BASIC' then greatest(0, 50 - coalesce(u.tools_used, 0))
       else greatest(0, 10 - coalesce(u.tools_used, 0)) end as tool_uses_remaining
from public.profiles p
left join public.subscriptions s on s.user_id = p.user_id
left join public.usage_daily u on u.user_id = p.user_id and u.day = current_date;

-- 5. Document-credit meter (resume / cover letter / answers) -----------------
create or replace function public.consume_ai_credit(p_user_id uuid) returns void language plpgsql security definer as $$
declare lim int; used int; plan public.plan_code;
begin
  select coalesce(s.plan,'FREE') into plan from subscriptions s where s.user_id=p_user_id;
  lim := case when plan='MAX' then 40 when plan='PREMIUM' then 20 when plan='BASIC' then 10 else 3 end;
  insert into usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  select ai_used into used from usage_daily where user_id=p_user_id and day=current_date for update;
  if used >= lim then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
  update usage_daily set ai_used=ai_used+1 where user_id=p_user_id and day=current_date;
end $$;

-- 6. Automation-slot meter (auto-apply) --------------------------------------
create or replace function public.reserve_application_slot(p_user_id uuid,p_job_id uuid,p_email text) returns uuid language plpgsql security definer as $$
declare lim int; used int; plan public.plan_code; app_id uuid; idem text;
begin
  select coalesce(s.plan,'FREE') into plan from subscriptions s where s.user_id=p_user_id;
  if plan='FREE' then raise exception 'AUTOMATION_NOT_ENTITLED'; end if;
  lim := case when plan='MAX' then 40 when plan='PREMIUM' then 20 else 10 end;
  insert into usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  select applications_used into used from usage_daily where user_id=p_user_id and day=current_date for update;
  if used >= lim then raise exception 'APPLICATION_QUOTA_EXHAUSTED'; end if;
  idem := p_user_id::text||':'||p_job_id::text;
  select id into app_id from applications where idempotency_key=idem;
  if app_id is not null then return app_id; end if;
  insert into applications(user_id,job_id,email,idempotency_key) values(p_user_id,p_job_id,p_email,idem) returning id into app_id;
  update usage_daily set applications_used=applications_used+1 where user_id=p_user_id and day=current_date;
  insert into agent_tasks(user_id,application_id,type,payload) values(p_user_id,app_id,'APPLICATION',jsonb_build_object('job_id',p_job_id));
  return app_id;
end $$;

-- 7. Free career-tool meter --------------------------------------------------
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

-- 8. Payment → plan mapping (MAX at ₦20,000) ---------------------------------
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
