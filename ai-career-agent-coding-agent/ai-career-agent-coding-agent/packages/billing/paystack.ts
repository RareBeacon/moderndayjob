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
import { planForAmount, planForAmountIn } from './flutterwave';

export { planForAmount, planForAmountIn };

const PAYSTACK_BASE = 'https://api.paystack.co';

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export interface PaystackInitInput {
  reference: string;
  /** Major units of the charge currency (naira or USD); must match subscription_plans. */
  amount: number;
  /** Charge currency. NGN is the default and settles as before; USD is used
   *  for visitors from outside Nigeria (Paystack international payments) and
   *  settles in Naira at Paystack's rate. */
  currency?: 'NGN' | 'USD';
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
      amount: Math.round(input.amount * 100), // kobo (NGN) or cents (USD)
      currency: input.currency ?? 'NGN',
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

/* ── Free auto-apply activation (Milestone 3, owner decision D2) ──────────
   Paystack's official card-verification flow: initialize an authorization
   with purpose=ADD_CARD. The card is authenticated with a ZERO-amount
   authorization (never charged) and the user completes 3DS on Paystack's
   page. We deliberately do NOT pass recurring_consent, so Paystack marks
   the authorization non-reusable: nobody can ever charge this card through
   us afterwards, which is exactly what the product promises.
   Card details pass through the server transiently (TLS in, immediate
   relay, never stored, never logged) because this endpoint requires them;
   subscription payments stay fully provider-hosted. */

export interface CardAuthorizationInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  card: {
    number: string;
    cvv: string;
    expiryMonth: string;
    expiryYear: string;
    cardholderName?: string | null;
  };
  returnUrl: string;
}

export interface CardAuthorizationInit {
  authorizationAccessCode: string;
  action: string;
  /** The Paystack 3DS page the user must complete the check on. */
  value: string;
}

export async function initializeCardAuthorization(input: CardAuthorizationInput): Promise<CardAuthorizationInit> {
  if (!paystackConfigured()) throw new Error('BILLING_NOT_CONFIGURED');
  const res = await fetch(`${PAYSTACK_BASE}/customer/authorization/initialize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        email: input.email,
        ...(input.firstName ? { first_name: input.firstName } : {}),
        ...(input.lastName ? { last_name: input.lastName } : {}),
      },
      currency: 'NGN',
      channel: 'card',
      card: {
        number: input.card.number,
        cvv: input.card.cvv,
        expiry_month: input.card.expiryMonth,
        expiry_year: input.card.expiryYear,
        ...(input.card.cardholderName ? { cardholder_name: input.card.cardholderName } : {}),
      },
      purpose: 'ADD_CARD',
      // No recurring_consent, on purpose: the card can never be charged.
      return_url: input.returnUrl,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { authorizationAccessCode?: string; action?: string; value?: string };
  } | null;
  if (!res.ok || !body?.status || !body.data?.authorizationAccessCode || !body.data.value) {
    throw new Error(`PAYSTACK_CARD_INIT_FAILED${body?.message ? `: ${body.message}` : ''}`);
  }
  return {
    authorizationAccessCode: body.data.authorizationAccessCode,
    action: body.data.action ?? 'redirect',
    value: body.data.value,
  };
}

export interface CardAuthorizationVerification {
  /** Paystack status of the validation (e.g. 'success', 'initialized'). */
  status: string;
  /** Paystack's advice; 'PROCEED' means the card verified successfully. */
  advise: string | null;
  customerEmail: string | null;
}

/** Re-check a card verification server-side by its access code. The webhook
 *  payload is never trusted on its own (same rule as payments). */
export async function verifyCardAuthorization(accessCode: string): Promise<CardAuthorizationVerification> {
  if (!paystackConfigured()) throw new Error('BILLING_NOT_CONFIGURED');
  const res = await fetch(`${PAYSTACK_BASE}/customer/authorization/verify/${encodeURIComponent(accessCode)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; advise?: string; customerEmail?: string };
  } | null;
  if (!res.ok || !body?.status || !body.data) {
    throw new Error(`PAYSTACK_CARD_VERIFY_FAILED${body?.message ? `: ${body.message}` : ''}`);
  }
  return {
    status: body.data.status ?? 'unknown',
    advise: body.data.advise ?? null,
    customerEmail: body.data.customerEmail ?? null,
  };
}
