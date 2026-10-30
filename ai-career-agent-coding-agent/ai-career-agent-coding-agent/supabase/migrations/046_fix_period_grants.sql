-- 046_fix_period_grants.sql
--
-- Fixes credit_ensure_period_grants (Bugs #11 & #12c):
--  1. Uses effective_plan(p_user) + profiles.comped_plan so CANCELLED/EXPIRED
--     subscriptions never receive paid grants and comped/scheduled grants do.
--  2. Guards against NULL subscriptions.current_period_start / end so admin or
--     comped grants without explicit period bounds never fail NOT NULL casts.
--  3. Includes plan_code in paid idempotency keys so mid-period upgrades
--     (e.g. BASIC -> PREMIUM -> MAX on the same starts_at date) issue the
--     new plan's grant instead of colliding on period_id alone, while keeping
--     the FREE key shape unchanged so existing free grants are never duplicated.
--  4. Adds single-user credit_ensure_user_period_grants(p_user, p_now) plus
--     triggers on profiles, subscriptions, and auto_apply_activations so new
--     accounts, paid upgrades, admin grants, and card verifications receive
--     their credits immediately at write time without waiting for the 06:00 cron.

create or replace function public.credit_ensure_user_period_grants(
  p_user uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_acct text;
  v_eff_plan text;
  v_comped_plan text;
  v_comped_until timestamptz;
  v_sub_start timestamptz;
  v_sub_end timestamptz;
  v_period_start date;
  v_period_end date;
  v_period_id uuid;
  v_docs int;
  v_apps int;
  v_doc_key text;
  v_app_key text;
  v_granted int := 0;
begin
  select p.account_status, p.comped_plan::text, p.comped_until
    into v_acct, v_comped_plan, v_comped_until
    from public.profiles p
   where p.user_id = p_user;

  if v_acct is null or v_acct <> 'ACTIVE' then
    return 0;
  end if;

  v_eff_plan := coalesce(public.effective_plan(p_user)::text, 'FREE');
  if v_eff_plan = 'FREE'
     and v_comped_plan in ('BASIC', 'PREMIUM', 'MAX')
     and (v_comped_until is null or v_comped_until > p_now) then
    v_eff_plan := v_comped_plan;
  end if;

  select s.current_period_start, s.current_period_end
    into v_sub_start, v_sub_end
    from public.subscriptions s
   where s.user_id = p_user;

  if v_eff_plan in ('BASIC', 'PREMIUM', 'MAX') then
    v_period_start := coalesce(v_sub_start, date_trunc('month', p_now))::date;
    v_period_end := coalesce(
      case when v_sub_end is not null and v_sub_end > p_now then v_sub_end else null end,
      v_comped_until,
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
    v_apps := coalesce((
      select 5 from public.auto_apply_activations a
      where a.user_id = p_user and a.status = 'ACTIVE'
      limit 1
    ), 0);

    v_doc_key := 'grant:' || p_user::text || ':DOCUMENT:' || v_period_id::text;
    v_app_key := 'grant:' || p_user::text || ':AUTO_APPLY:' || v_period_id::text;
  end if;

  if v_docs is not null and v_docs > 0
     and public.credit_grant(p_user, 'DOCUMENT', v_docs, v_period_id, v_doc_key, 'period-grant') then
    v_granted := v_granted + 1;
  end if;

  if v_apps is not null and v_apps > 0
     and public.credit_grant(p_user, 'AUTO_APPLY', v_apps, v_period_id, v_app_key, 'period-grant') then
    v_granted := v_granted + 1;
  end if;

  return v_granted;
end $$;

create or replace function public.credit_ensure_period_grants(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  granted int := 0;
begin
  for rec in
    select p.user_id
      from public.profiles p
     where p.account_status = 'ACTIVE'
  loop
    granted := granted + public.credit_ensure_user_period_grants(rec.user_id, p_now);
  end loop;
  return granted;
end $$;

create or replace function public.tg_ensure_user_period_grants()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.credit_ensure_user_period_grants(new.user_id, now());
  return new;
end $$;

drop trigger if exists trg_profiles_ensure_period_grants on public.profiles;
create trigger trg_profiles_ensure_period_grants
  after insert or update of account_status, comped_plan, comped_until on public.profiles
  for each row execute function public.tg_ensure_user_period_grants();

drop trigger if exists trg_subscriptions_ensure_period_grants on public.subscriptions;
create trigger trg_subscriptions_ensure_period_grants
  after insert or update of plan, status, current_period_start, current_period_end on public.subscriptions
  for each row execute function public.tg_ensure_user_period_grants();

drop trigger if exists trg_activations_ensure_period_grants on public.auto_apply_activations;
create trigger trg_activations_ensure_period_grants
  after insert or update of status on public.auto_apply_activations
  for each row execute function public.tg_ensure_user_period_grants();
