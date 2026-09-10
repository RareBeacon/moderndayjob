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

/** Best-effort read of Flutterwave's error body so failures are diagnosable
 *  (e.g. account-not-activated vs invalid redirect_url vs bad key). The 400
 *  "One or more required parameters missing" is generic — the field-level
 *  reasons live in the `errors[]` array, so surface those too. */
async function readFlwError(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as {
      message?: string;
      error?: string;
      data?: { message?: string };
      errors?: Array<{ field?: string; message?: string }>;
    };
    const parts: string[] = [];
    const detail = body?.message ?? body?.error ?? body?.data?.message ?? '';
    if (detail) parts.push(detail);
    const fieldErrors = (body?.errors ?? [])
      .map((e) => `${e.field ?? '?'}: ${e.message ?? ''}`)
      .filter(Boolean);
    if (fieldErrors.length) parts.push(fieldErrors.join(' | '));
    return parts.length ? `: ${parts.join('; ')}` : '';
  } catch {
    return '';
  }
}

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
  if (!res.ok) {
    // Masked echo of what was sent, so provider rejections are diagnosable
    // (which required field was missing / mistyped) without leaking PII.
    const sent = `amount=${input.amount}(${typeof input.amount}) currency=${input.currency ?? 'NGN'} redirect=${input.redirect_url} email=${input.customer.email ? 'present' : 'MISSING'} tx_ref=${input.tx_ref}`;
    throw new Error(`FLW_CREATE_FAILED:${res.status}${await readFlwError(res)} [sent: ${sent}]`);
  }
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
  if (!res.ok) throw new Error(`FLW_VERIFY_FAILED:${res.status}${await readFlwError(res)}`);
  const data = (await res.json()) as { status?: string; data?: Partial<FlwVerifyResult> };
  if (data.status !== 'success' || !data.data || !data.data.status) throw new Error('FLW_VERIFY_INVALID');
  return data.data as FlwVerifyResult;
}

/* Known plan amounts in NGN naira (must match subscription_plans.amount and
   the apply_verified_payment threshold). Used to guard the webhook against
   under/over-payment before granting a plan. */
export const PLAN_AMOUNTS_NGN = { BASIC: 5000, PREMIUM: 10000, MAX: 20000 } as const;
export type PaidPlan = 'BASIC' | 'PREMIUM' | 'MAX';

export function planForAmount(amount: number): PaidPlan | null {
  if (amount === PLAN_AMOUNTS_NGN.MAX) return 'MAX';
  if (amount === PLAN_AMOUNTS_NGN.PREMIUM) return 'PREMIUM';
  if (amount === PLAN_AMOUNTS_NGN.BASIC) return 'BASIC';
  return null;
}
