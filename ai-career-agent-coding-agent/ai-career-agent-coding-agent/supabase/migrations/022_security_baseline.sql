-- 022_security_baseline.sql
-- Security-baseline hardening from the Master Implementation Package (Book II §8,
-- Book IV audit findings D1 + D6), applied 2026-09-16.
--
-- D1: public.subscription_plans was the only table in the database created
--     without `enable row level security` (created in 001_initial.sql line 11;
--     every other table has RLS). It is plan catalog reference data that the
--     app reads only through the service role (which bypasses RLS), so the
--     correct posture is RLS-on with NO policies: deny-by-default for
--     anon/authenticated, unreachable via PostgREST with the publishable key.
--
-- D6: the four SECURITY DEFINER functions from 013_entitlement_quotas_v2.sql
--     had no `set search_path` pinned and referenced tables unqualified. A
--     SECURITY DEFINER function without a pinned search_path is a privilege
--     escalation primitive (an attacker who can create objects in another
--     schema on the shared instance can shadow table names). They are
--     re-created here verbatim with `set search_path = public` and fully
--     qualified table names, following the pattern already established by
--     009_fix_handle_new_user_searchpath.sql.
--
-- Idempotent: safe to re-run. Functionally identical to 013 (same bodies).

-- ============================================================
-- 1) RLS on the plan catalog (deny-by-default; service-role only)
-- ============================================================
alter table public.subscription_plans enable row level security;

-- Belt and braces: force RLS even for the table owner.
alter table public.subscription_plans force row level security;

-- No policies and no anon grants: the table is server-only. The service role
-- (used by every app read of subscription_plans) bypasses RLS by design.

-- ============================================================
-- 2) Re-create 013's quota/payment functions with pinned search_path
--    (bodies identical to 013; names now qualified, search_path pinned)
-- ============================================================

create or replace function public.consume_ai_credit(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare lim int; used int; plan public.plan_code; life int;
begin
  select coalesce(s.plan,'FREE') into plan from public.subscriptions s where s.user_id=p_user_id;
  if plan = 'FREE' then
    insert into public.usage_lifetime(user_id) values(p_user_id) on conflict do nothing;
    select docs_used into life from public.usage_lifetime where user_id=p_user_id for update;
    if life >= 3 then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
    update public.usage_lifetime set docs_used = docs_used + 1 where user_id=p_user_id;
    return;
  end if;
  lim := case when plan='MAX' then 20 when plan='PREMIUM' then 10 else 3 end;
  insert into public.usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  select ai_used into used from public.usage_daily where user_id=p_user_id and day=current_date for update;
  if used >= lim then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
  update public.usage_daily set ai_used=ai_used+1 where user_id=p_user_id and day=current_date;
end $$;

create or replace function public.reserve_application_slot(p_user_id uuid,p_job_id uuid,p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare lim int; used int; plan public.plan_code; app_id uuid; idem text; life int;
begin
  select coalesce(s.plan,'FREE') into plan from public.subscriptions s where s.user_id=p_user_id;
  if plan='FREE' then raise exception 'AUTOMATION_NOT_ENTITLED'; end if;
  idem := p_user_id::text||':'||p_job_id::text;
  if plan='BASIC' then
    insert into public.usage_lifetime(user_id) values(p_user_id) on conflict do nothing;
    select auto_apply_used into life from public.usage_lifetime where user_id=p_user_id for update;
    if life >= 2 then raise exception 'APPLICATION_QUOTA_EXHAUSTED'; end if;
    select id into app_id from public.applications where idempotency_key=idem;
    if app_id is not null then return app_id; end if;
    insert into public.applications(user_id,job_id,email,idempotency_key) values(p_user_id,p_job_id,p_email,idem) returning id into app_id;
    update public.usage_lifetime set auto_apply_used = auto_apply_used + 1 where user_id=p_user_id;
    insert into public.agent_tasks(user_id,application_id,type,payload) values(p_user_id,app_id,'APPLICATION',jsonb_build_object('job_id',p_job_id));
    return app_id;
  end if;
  lim := case when plan='MAX' then 20 else 10 end;
  insert into public.usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  select applications_used into used from public.usage_daily where user_id=p_user_id and day=current_date for update;
  if used >= lim then raise exception 'APPLICATION_QUOTA_EXHAUSTED'; end if;
  select id into app_id from public.applications where idempotency_key=idem;
  if app_id is not null then return app_id; end if;
  insert into public.applications(user_id,job_id,email,idempotency_key) values(p_user_id,p_job_id,p_email,idem) returning id into app_id;
  update public.usage_daily set applications_used=applications_used+1 where user_id=p_user_id and day=current_date;
  insert into public.agent_tasks(user_id,application_id,type,payload) values(p_user_id,app_id,'APPLICATION',jsonb_build_object('job_id',p_job_id));
  return app_id;
end $$;

create or replace function public.consume_tool_use(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare lim int; used int; plan public.plan_code;
begin
  select coalesce(s.plan,'FREE') into plan from public.subscriptions s where s.user_id=p_user_id;
  lim := case when plan='PREMIUM' or plan='MAX' then null when plan='BASIC' then 50 else 10 end;
  insert into public.usage_daily(user_id,day) values(p_user_id,current_date) on conflict do nothing;
  if lim is not null then
    select tools_used into used from public.usage_daily where user_id=p_user_id and day=current_date for update;
    if used >= lim then raise exception 'TOOL_QUOTA_EXHAUSTED'; end if;
  end if;
  update public.usage_daily set tools_used=coalesce(tools_used,0)+1 where user_id=p_user_id and day=current_date;
end $$;

create or replace function public.apply_verified_payment(p_transaction_id text,p_tx_ref text,p_amount numeric,p_currency text,p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; plan public.plan_code;
begin
  select id into uid from auth.users where lower(email)=lower(p_email);
  if uid is null then raise exception 'USER_NOT_FOUND'; end if;
  select case when p_amount>=20000 then 'MAX'::public.plan_code when p_amount>=10000 then 'PREMIUM'::public.plan_code else 'BASIC'::public.plan_code end into plan;
  insert into public.payments(user_id,provider,transaction_id,tx_ref,amount,currency,status)
    values(uid,'flutterwave',p_transaction_id,p_tx_ref,p_amount,p_currency,'successful')
    on conflict(transaction_id) do nothing;
  insert into public.subscriptions(user_id,plan,status,current_period_start,current_period_end,provider,provider_customer_id)
    values(uid,plan,
      case when plan='MAX' then 'ACTIVE_MAX' when plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end,
      now(),now()+interval '30 days','flutterwave',p_email)
    on conflict(user_id) do update set plan=excluded.plan,status=excluded.status,
      current_period_start=now(),current_period_end=now()+interval '30 days',updated_at=now();
end $$;

comment on function public.consume_ai_credit(uuid) is 'FREE lifetime cap 3 / paid daily caps. search_path pinned (022).';
comment on function public.reserve_application_slot(uuid,uuid,text) is 'BASIC 2 lifetime / P+M daily caps, idempotent by user:job. search_path pinned (022).';
comment on function public.consume_tool_use(uuid) is 'Tool-use meter (10/50/unlimited). search_path pinned (022).';
comment on function public.apply_verified_payment(text,text,numeric,text,text) is 'Idempotent payment grant. search_path pinned (022).';
