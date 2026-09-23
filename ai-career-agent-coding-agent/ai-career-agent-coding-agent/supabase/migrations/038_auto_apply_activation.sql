-- 038: free auto-apply activation (Enterprise upgrade Milestone 3, owner
-- decision D2: zero-amount card verification via Paystack purpose=ADD_CARD).
--
-- Flow: the user enters card details on our activation page; the server
-- relays them to Paystack's customer/authorization/initialize (purpose
-- ADD_CARD, card channel, NO recurring_consent so the card can never be
-- charged later) and stores a PENDING row keyed by the access code Paystack
-- returned. The user completes 3DS on Paystack's page; Paystack sends
-- zero_charge_authorization.success to the billing webhook, which re-verifies
-- server-side and calls apply_card_activation: the row flips to ACTIVE and
-- the user receives 5 AUTO_APPLY credits for the current calendar month
-- (decision D1: FREE auto-apply is 0 before activation, 5 after).
--
-- Card data never touches this database: only last4 / brand / bank are
-- stored, and only for display ("we never store your card number").

create table if not exists public.auto_apply_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'FAILED')),
  access_code text not null unique,
  reference text,
  card_last4 text,
  card_brand text,
  bank text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auto_apply_activations enable row level security;
-- No policies: service-role only (same pattern as 027 and the 037 ledger).

-- Grant the activation allowance on the current calendar month. Uses the
-- SAME idempotency key as the nightly period grants for the AUTO_APPLY
-- resource, so an activation and a nightly grant can never double-issue the
-- same 5 credits for the same period.
create or replace function public.credit_activation_grant(p_user uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_period uuid;
begin
  insert into public.credit_periods (user_id, kind, starts_at, ends_at, plan_code)
  values (p_user, 'CALENDAR', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month')::date, 'FREE')
  on conflict (user_id, kind, starts_at) do update set plan_code = 'FREE'
  returning id into v_period;

  return public.credit_grant(p_user, 'AUTO_APPLY', 5, v_period,
    'grant:' || p_user || ':AUTO_APPLY:' || v_period::text, 'card-verification-activation');
end $$;

-- Webhook entry point: flip the matching PENDING row to ACTIVE and issue
-- the activation grant. Idempotent (status <> 'ACTIVE' guard + idempotent
-- grant key). Returns the activated user, or null when nothing matched.
create or replace function public.apply_card_activation(
  p_access_code text, p_reference text,
  p_last4 text default null, p_brand text default null, p_bank text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  update public.auto_apply_activations
     set status = 'ACTIVE',
         reference = coalesce(p_reference, reference),
         card_last4 = coalesce(p_last4, card_last4),
         card_brand = coalesce(p_brand, card_brand),
         bank = coalesce(p_bank, bank),
         activated_at = now(),
         updated_at = now()
   where access_code = p_access_code
     and status <> 'ACTIVE'
  returning user_id into v_user;

  if v_user is not null then
    perform public.credit_activation_grant(v_user);
  end if;
  return v_user;
end $$;

-- Period grants, updated for activation: verified (ACTIVE) accounts get 5
-- monthly AUTO_APPLY credits on their calendar period; everyone else gets 0.
-- Paid subscription periods are unchanged (the plan's own allowance).
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
      apps := coalesce((
        select 5 from public.auto_apply_activations a
        where a.user_id = rec.user_id and a.status = 'ACTIVE'
        limit 1
      ), 0);
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
