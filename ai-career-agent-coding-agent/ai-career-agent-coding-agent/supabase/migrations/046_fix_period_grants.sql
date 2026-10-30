-- 046_fix_period_grants.sql
--
-- Fixes credit_ensure_period_grants (Bugs #11 & #12c):
--  1. Uses effective_plan(p_user) (falling back safely to active subscriptions
--     if 043 has not run yet) so CANCELLED/EXPIRED subscriptions never receive
--     paid grants while active paid, admin-comped, and due scheduled grants do.
--  2. Guards against NULL subscriptions.current_period_start / end so admin or
--     scheduled grants without explicit period bounds never fail NOT NULL casts.
--  3. Includes plan_code in paid idempotency keys so mid-period upgrades
--     (e.g. BASIC -> PREMIUM -> MAX on the same starts_at date) issue the
--     new plan's grant instead of colliding on period_id alone, while keeping
--     the FREE key shape unchanged so existing free grants are never duplicated.
--  4. Adds single-user credit_ensure_user_period_grants(p_user, p_now) plus
--     triggers on profiles, subscriptions, scheduled_plan_changes, and
--     auto_apply_activations so new accounts, paid upgrades, admin grants, and
--     card verifications receive their credits immediately at write time.

create or replace function public.credit_ensure_user_period_grants(
  p_user uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_acct text;
  v_eff_plan text;
  v_sub_plan text;
  v_sub_status text;
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
  -- If credit_periods (037) has not been created yet, no-op safely.
  if to_regclass('public.credit_periods') is null then
    return 0;
  end if;

  select p.account_status::text
    into v_acct
    from public.profiles p
   where p.user_id = p_user;

  if v_acct is null or v_acct <> 'ACTIVE' then
    return 0;
  end if;

  select s.plan::text, s.status::text, s.current_period_start, s.current_period_end
    into v_sub_plan, v_sub_status, v_sub_start, v_sub_end
    from public.subscriptions s
   where s.user_id = p_user;

  begin
    v_eff_plan := coalesce(public.effective_plan(p_user)::text, 'FREE');
  exception when undefined_function then
    if v_sub_plan in ('BASIC', 'PREMIUM', 'MAX')
       and v_sub_status in ('ACTIVE_BASIC', 'ACTIVE_PREMIUM', 'ACTIVE_MAX')
       and (v_sub_end is null or v_sub_end > p_now) then
      v_eff_plan := v_sub_plan;
    else
      v_eff_plan := 'FREE';
    end if;
  end;

  if v_eff_plan in ('BASIC', 'PREMIUM', 'MAX') then
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
  after insert or update of account_status on public.profiles
  for each row execute function public.tg_ensure_user_period_grants();

drop trigger if exists trg_subscriptions_ensure_period_grants on public.subscriptions;
create trigger trg_subscriptions_ensure_period_grants
  after insert or update of plan, status, current_period_start, current_period_end on public.subscriptions
  for each row execute function public.tg_ensure_user_period_grants();

do $$
begin
  if to_regclass('public.scheduled_plan_changes') is not null then
    execute 'drop trigger if exists trg_scheduled_plans_ensure_period_grants on public.scheduled_plan_changes';
    execute 'create trigger trg_scheduled_plans_ensure_period_grants after insert or update of status, activate_at on public.scheduled_plan_changes for each row execute function public.tg_ensure_user_period_grants()';
  end if;
  if to_regclass('public.auto_apply_activations') is not null then
    execute 'drop trigger if exists trg_activations_ensure_period_grants on public.auto_apply_activations';
    execute 'create trigger trg_activations_ensure_period_grants after insert or update of status on public.auto_apply_activations for each row execute function public.tg_ensure_user_period_grants()';
  end if;
end $$;
