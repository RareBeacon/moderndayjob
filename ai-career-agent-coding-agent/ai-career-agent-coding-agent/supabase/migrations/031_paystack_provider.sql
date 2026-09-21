-- 031_paystack_provider.sql
--
-- Paystack is now a payment provider alongside Flutterwave (owner decision
-- 2026-09-21). apply_verified_payment previously hardcoded provider
-- 'flutterwave' in the payments and subscriptions rows; it now takes a
-- p_provider parameter (default 'flutterwave', so every existing Flutterwave
-- call site is unchanged). Plan logic and idempotency are untouched.
-- Idempotent; RLS posture unchanged.

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
      case when plan='MAX' then 'ACTIVE_MAX' when plan='PREMIUM' then 'ACTIVE_PREMIUM' else 'ACTIVE_BASIC' end,
      now(), now()+interval '30 days', p_provider, p_email)
    on conflict(user_id) do update set plan=excluded.plan, status=excluded.status,
      current_period_start=now(), current_period_end=now()+interval '30 days', updated_at=now();
end $$;

-- The 6-parameter signature is an overload of the original 5-parameter
-- function (create-or-replace cannot change a signature). PostgREST cannot
-- safely disambiguate the two when the Flutterwave path calls with 5 named
-- arguments, so the old overload is removed; the new function's DEFAULT
-- keeps every 5-argument call working unchanged.
drop function if exists public.apply_verified_payment(text, text, numeric, text, text);
