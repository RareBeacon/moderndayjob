-- 041_usd_pricing.sql
--
-- International pricing (2026-09-24): visitors from outside Nigeria see and
-- are charged US dollars; Nigerian visitors keep Naira. Paystack (with
-- international payments enabled) initializes USD transactions for Nigerian
-- accounts and settles them in Naira at Paystack's rate.
--
-- 1) subscription_plans gains an explicit USD list price per plan. The NGN
--    amount stays the billing base; amount_usd is null-safe everywhere, so
--    environments without this migration simply keep charging NGN.
-- 2) apply_verified_payment becomes currency-aware: USD payments map to plans
--    with dollar thresholds (14.99 / 7.99 / 3.99), everything else keeps the
--    Naira thresholds (20000 / 10000). Route-level guards (planForAmountIn)
--    already reject amounts below the BASIC price, so the loose ELSE branch
--    is unreachable from the API, mirroring the previous design.
--    Idempotent: CREATE OR REPLACE, additive column, no data removed.

alter table public.subscription_plans add column if not exists amount_usd numeric(12,2);

update public.subscription_plans set amount_usd = 3.99 where code = 'BASIC' and amount_usd is null;
update public.subscription_plans set amount_usd = 7.99 where code = 'PREMIUM' and amount_usd is null;
update public.subscription_plans set amount_usd = 14.99 where code = 'MAX' and amount_usd is null;

create or replace function public.apply_verified_payment(p_transaction_id text, p_tx_ref text, p_amount numeric, p_currency text, p_email text, p_provider text default 'flutterwave')
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; plan public.plan_code;
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
  insert into public.payments(user_id,provider,transaction_id,tx_ref,amount,currency,status)
    values(uid, p_provider, p_transaction_id, p_tx_ref, p_amount, p_currency, 'successful')
    on conflict(transaction_id) do nothing;
  insert into public.subscriptions(user_id,plan,status,current_period_start,current_period_end,provider,provider_customer_id)
    values(uid, plan,
      case when plan='MAX' then 'ACTIVE_MAX' when plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end::public.subscription_status,
      now(), now()+interval '30 days', p_provider, p_email)
    on conflict(user_id) do update set plan=excluded.plan, status=excluded.status,
      current_period_start=now(), current_period_end=now()+interval '30 days', updated_at=now();
end $$;
