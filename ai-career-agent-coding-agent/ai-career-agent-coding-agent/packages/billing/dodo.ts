/* Dodo Payments billing; Merchant of Record integration (2026-09-27).
   Dodo is the Merchant of Record: it calculates, collects, and remits
   VAT/sales tax on every transaction, which removes the tax-compliance
   problem Paystack-USD carries. Used for USD checkouts (visitors outside
   Nigeria); Nigerian visitors keep the Naira Paystack path.

   Auth: Bearer DODO_PAYMENTS_API_KEY. Base URL follows
   DODO_PAYMENTS_ENVIRONMENT ("test_mode" -> test.dodopayments.com,
   "live_mode" -> live.dodopayments.com).
   - createDodoCheckout -> hosted checkout session (checkout_url, single-use)
   - retrieveDodoPayment -> server-side re-verification, by payment_id
   - verifyDodoWebhookSignature -> Standard Webhooks scheme:
     HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}` keyed
     with DODO_PAYMENTS_WEBHOOK_KEY, compared against the webhook-signature
     header (format "v1,<base64>"). Signature-only (no timestamp window):
     Dodo retries deliveries for up to ~10 hours, and each retry carries the
     original timestamp; replays are handled by webhook-id dedup instead.

   The plan upgrade is performed by the same idempotent DB function the
   Paystack/Flutterwave paths use, apply_verified_payment(...), invoked from
   the webhook with p_provider = 'dodo'. Products are created in the Dodo
   dashboard and mapped per plan via DODO_PRODUCT_<PLAN> env vars; the
   charged amount is still guarded against subscription_plans.amount_usd.
   No client ever authorizes a plan; the server is the single source of truth. */

import crypto from 'node:crypto';
import { planForAmountIn } from './flutterwave';

export { planForAmountIn };

const DODO_API_BASE = process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode'
  ? 'https://live.dodopayments.com'
  : 'https://test.dodopayments.com';

export type DodoPlan = 'BASIC' | 'PREMIUM' | 'MAX';

export function dodoConfigured(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY);
}

/** The dashboard product id configured for each plan (env-mapped). */
export function dodoProductIdForPlan(plan: DodoPlan): string | null {
  const key = `DODO_PRODUCT_${plan}`;
  return process.env[key] ?? null;
}

/** Reverse map: a dashboard product id -> the plan it grants. */
export function dodoPlanForProductId(productId: string): DodoPlan | null {
  for (const plan of ['BASIC', 'PREMIUM', 'MAX'] as const) {
    if (process.env[`DODO_PRODUCT_${plan}`] === productId) return plan;
  }
  return null;
}

export interface DodoCheckoutInput {
  productId: string;
  email: string;
  name?: string | null;
  returnUrl: string;
  metadata?: Record<string, unknown>;
}

export interface DodoCheckoutResult {
  session_id: string;
  checkout_url: string;
}

export async function createDodoCheckout(input: DodoCheckoutInput): Promise<DodoCheckoutResult> {
  if (!dodoConfigured()) throw new Error('BILLING_NOT_CONFIGURED');
  const res = await fetch(`${DODO_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_cart: [{ product_id: input.productId, quantity: 1 }],
      customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
      return_url: input.returnUrl,
      metadata: input.metadata ?? {},
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as (DodoCheckoutResult & { error?: string }) | null;
  if (!res.ok || !body?.checkout_url) {
    const detail = body?.error ?? `HTTP ${res.status}`;
    throw new Error(`DODO_CHECKOUT_FAILED: ${detail}`);
  }
  return { session_id: body.session_id, checkout_url: body.checkout_url };
}

export interface DodoPayment {
  payment_id: string;
  status: string;
  /** Minor units (cents). */
  total_amount: number;
  currency: string;
  customer: { email?: string | null } | null;
  product_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Re-fetch a payment from Dodo by id. Never trust the webhook payload. */
export async function retrieveDodoPayment(paymentId: string): Promise<DodoPayment> {
  if (!dodoConfigured()) throw new Error('BILLING_NOT_CONFIGURED');
  const res = await fetch(`${DODO_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${process.env.DODO_PAYMENTS_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as DodoPayment | null;
  if (!res.ok || !body?.payment_id) {
    throw new Error(`DODO_VERIFY_FAILED: HTTP ${res.status}`);
  }
  return body;
}

/**
 * Standard Webhooks signature check: HMAC-SHA256 over
 * `${webhook-id}.${webhook-timestamp}.${rawBody}`, keyed with the webhook
 * secret, compared (timing-safe) against each "v1,<base64>" entry in the
 * webhook-signature header. Returns true only on an exact match.
 */
export function verifyDodoWebhookSignature(
  rawBody: string,
  webhookId: string | null,
  timestamp: string | null,
  signatureHeader: string | null,
  secret: string | undefined = process.env.DODO_PAYMENTS_WEBHOOK_KEY,
): boolean {
  if (!secret || !webhookId || !timestamp || !signatureHeader) return false;
  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedContent, 'utf8').digest();
  // The header is "v1,<base64>"; multiple signatures are space-separated
  // ("v1,<b64> v1,<b64>"). Any exact v1 match is valid.
  for (const token of signatureHeader.split(/\s+/)) {
    if (!token.startsWith('v1,')) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(token.slice(3), 'base64');
    } catch {
      continue;
    }
    if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  return false;
}
