/* Paystack billing; Standard integration.
   Auth: Bearer PAYSTACK_SECRET_KEY. Webhook signature: x-paystack-signature =
   HMAC-SHA512 of the RAW request body keyed with the secret key.
   - initializePaystackTransaction -> hosted checkout (authorization_url)
   - verifyPaystackTransaction -> re-check a transaction server-side, by the
     reference we generated at creation (references are `pstk_<user>_<time>`).
   The plan upgrade is performed by the same idempotent DB function the
   Flutterwave path uses, apply_verified_payment(...), invoked from the
   webhook with p_provider = 'paystack'. Amounts are NGN, shared with the
   Flutterwave plan map (PLAN_AMOUNTS_NGN / planForAmount). No client ever
   authorizes a plan; the server is the single source of truth. */

import crypto from 'node:crypto';
import { planForAmount } from './flutterwave';

export { planForAmount };

const PAYSTACK_BASE = 'https://api.paystack.co';

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export interface PaystackInitInput {
  reference: string;
  /** NGN, major units (naira); must match subscription_plans.amount. */
  amount: number;
  email: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface PaystackInitResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initializePaystackTransaction(input: PaystackInitInput): Promise<PaystackInitResult> {
  if (!paystackConfigured()) throw new Error('BILLING_NOT_CONFIGURED');
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amount * 100), // Paystack takes kobo
      currency: 'NGN',
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: PaystackInitResult } | null;
  if (!res.ok || !body?.status || !body.data?.authorization_url) {
    const detail = body?.message ? `: ${body.message}` : '';
    throw new Error(`PAYSTACK_INIT_FAILED${detail}`);
  }
  return body.data;
}

export interface PaystackVerification {
  /** Paystack status: 'success' | 'failed' | 'abandoned' | 'ongoing' ... */
  status: string;
  /** Amount actually charged, in kobo (divide by 100 for naira). */
  amount: number;
  currency: string;
  reference: string;
  email: string | null;
}

/** Server-side verification. Callers must re-verify with this before any
 *  grant; the webhook payload is never trusted on its own. */
export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerification> {
  if (!paystackConfigured()) throw new Error('BILLING_NOT_CONFIGURED');
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; amount?: number; currency?: string; reference?: string; customer?: { email?: string } };
  } | null;
  if (!res.ok || !body?.status || !body.data) {
    throw new Error(`PAYSTACK_VERIFY_FAILED${body?.message ? `: ${body.message}` : ''}`);
  }
  return {
    status: body.data.status ?? 'unknown',
    amount: Number(body.data.amount ?? 0),
    currency: body.data.currency ?? '',
    reference: body.data.reference ?? reference,
    email: body.data.customer?.email ?? null,
  };
}

/** Expected value of the x-paystack-signature header for a raw body. */
export function paystackWebhookSignature(rawBody: string, secret: string | undefined = process.env.PAYSTACK_SECRET_KEY): string {
  return crypto.createHmac('sha512', secret ?? '').update(rawBody).digest('hex');
}
