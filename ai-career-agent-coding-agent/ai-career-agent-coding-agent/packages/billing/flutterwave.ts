/* Flutterwave billing — Standard (v3) integration.
   Auth: Bearer FLW_SECRET_KEY. Webhook secret: FLW_SECRET_HASH.
   - createFlutterwaveTransaction → hosted checkout link
   - verifyFlutterwaveTransaction → re-check a transaction server-side
   The actual plan upgrade is performed by the DB function
   apply_verified_payment(...) (idempotent), invoked from the webhook.
   No client ever authorizes a plan — server is the single source of truth. */

const FLW_BASE = 'https://api.flutterwave.com/v3';

export function flutterwaveConfigured(): boolean {
  return Boolean(process.env.FLW_SECRET_KEY && process.env.FLW_SECRET_HASH);
}

export type FlwCustomer = { email: string; name?: string };

export type FlwPaymentInput = {
  tx_ref: string;
  amount: number; // NGN, major units (naira) — must match subscription_plans.amount
  currency?: string;
  redirect_url: string;
  customer: FlwCustomer;
  payment_options?: string;
  customizations?: { title?: string; description?: string; logo?: string };
};

export type FlwCreateResult = { link: string };

export async function createFlutterwaveTransaction(input: FlwPaymentInput): Promise<FlwCreateResult> {
  if (!flutterwaveConfigured()) throw new Error('BILLING_NOT_CONFIGURED');
  const res = await fetch(`${FLW_BASE}/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: input.tx_ref,
      amount: input.amount,
      currency: input.currency ?? 'NGN',
      redirect_url: input.redirect_url,
      customer: input.customer,
      payment_options: input.payment_options ?? 'card,banktransfer,ussd',
      customizations: input.customizations ?? {},
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`FLW_CREATE_FAILED:${res.status}`);
  const data = (await res.json()) as { status?: string; data?: { link?: string } };
  if (data.status !== 'success' || !data.data?.link) throw new Error('FLW_NO_CHECKOUT_LINK');
  return { link: data.data.link };
}

export type FlwVerifyResult = {
  id: number;
  tx_ref: string;
  amount: number;
  currency: string;
  status: string;
  customer: { email: string };
};

export async function verifyFlutterwaveTransaction(transactionId: string | number): Promise<FlwVerifyResult> {
  if (!flutterwaveConfigured()) throw new Error('BILLING_NOT_CONFIGURED');
  const res = await fetch(`${FLW_BASE}/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`FLW_VERIFY_FAILED:${res.status}`);
  const data = (await res.json()) as { status?: string; data?: Partial<FlwVerifyResult> };
  if (data.status !== 'success' || !data.data || !data.data.status) throw new Error('FLW_VERIFY_INVALID');
  return data.data as FlwVerifyResult;
}

/* Known plan amounts in NGN naira (must match subscription_plans.amount and
   the apply_verified_payment threshold). Used to guard the webhook against
   under/over-payment before granting a plan. */
export const PLAN_AMOUNTS_NGN = { BASIC: 5000, PREMIUM: 10000 } as const;
export type PaidPlan = 'BASIC' | 'PREMIUM';

export function planForAmount(amount: number): PaidPlan | null {
  if (amount === PLAN_AMOUNTS_NGN.PREMIUM) return 'PREMIUM';
  if (amount === PLAN_AMOUNTS_NGN.BASIC) return 'BASIC';
  return null;
}
