-- 034_fix_payment_grant_status_cast.sql
--
-- Live bug found by the first real Paystack test payment (2026-09-21):
-- apply_verified_payment failed with
--   ERROR 42804: column "status" is of type subscription_status but
--   expression is of type text
-- A CASE expression whose branches are all untyped string literals is
-- resolved by Postgres as text, and text has no implicit cast to an enum,
-- so the subscriptions insert always failed at runtime. Every live payment
-- (Flutterwave or Paystack) would have hit this; unit tests mock the RPC,
-- so it never surfaced until a real transaction ran.
--
-- Fix: cast each branch (and the whole expression) to public.subscription_status.
-- Everything else is byte-identical to the 031 definition. Idempotent;
-- CREATE OR REPLACE, no data or signature change; RLS posture unchanged.

create or replace function public.apply_verified_payment(p_transaction_id text, p_tx_ref text, p_amount numeric, p_currency text, p_email text, p_provider text default 'flutterwave')
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; plan public.plan_code;
begin
  select id into uid from auth.users where lower(email)=lower(p_email);
  if uid is null then raise exception 'USER_NOT_FOUND'; end if;
  select case when p_amount>=20000 then 'MAX'::public.plan_code when p_amount>=10000 then 'PREMIUM'::public.plan_code else 'BASIC'::public.plan_code end into plan;
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
