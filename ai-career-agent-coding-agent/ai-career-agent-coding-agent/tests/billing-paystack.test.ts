import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Paystack billing: package helpers + webhook security + verify route.
 * Same contract as the Flutterwave path: signature first, re-verify
 * server-side (never trust the payload), guard amount/currency/email, grant
 * only through the idempotent apply_verified_payment RPC (with
 * p_provider='paystack'), replay-safe. Also covers /api/billing/providers
 * (booleans only, no secrets) and the verify route's ownership prefix check.
 */

const { rpc, upsert, dedupQuery, requireUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  upsert: vi.fn(),
  dedupQuery: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc,
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle: dedupQuery }) }),
    }),
  },
}));
vi.mock('@/lib/auth', () => ({ requireUser, getUser: vi.fn() }));

import { POST as webhookPOST } from '@/app/api/billing/paystack/webhook/route';
import { POST as verifyPOST } from '@/app/api/billing/paystack/verify/route';
import { GET as providersGET } from '@/app/api/billing/providers/route';
import {
  initializePaystackTransaction,
  paystackWebhookSignature,
  verifyPaystackTransaction,
  planForAmount,
} from '@packages/billing/paystack';

const SECRET = 'sk_test_xyz';

function sign(body: string, secret = SECRET) {
  return paystackWebhookSignature(body, secret);
}

function req(body: unknown, signature?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-paystack-signature'] = signature;
  return new Request('http://localhost/api/billing/paystack/webhook', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function stubVerify(data: Record<string, unknown>, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => ({ status: true, data }) } as unknown as Response));
}

const REF = 'pstk_u1_1700000000000';
const chargeSuccess = { event: 'charge.success', data: { id: 99, reference: REF, status: 'success' } };

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  upsert.mockReset().mockResolvedValue({ error: null });
  dedupQuery.mockReset().mockResolvedValue({ data: null, error: null });
  requireUser.mockReset().mockResolvedValue({ id: 'u1', email: 'a@b.co' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.FLW_SECRET_KEY;
  delete process.env.FLW_SECRET_HASH;
});

describe('paystackWebhookSignature', () => {
  it('computes the documented HMAC-SHA512 of the raw body (fixed vector)', () => {
    // Independent vector: openssl dgst -sha512 -hmac sk_test_xyz
    expect(paystackWebhookSignature('{"event":"charge.success"}', 'sk_test_xyz')).toBe(
      '38d078be6ad19f3eabe98c0b2d1a4fbd678de545c19bffaa3a5128e0bd326ed59d96ba76fb6534a6c9f0c239d0dffffd266d38846f173fe764747aefbae960b4',
    );
  });
});

describe('initializePaystackTransaction', () => {
  it('sends kobo and returns the hosted checkout URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/x', access_code: 'ac', reference: REF } }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const r = await initializePaystackTransaction({ reference: REF, amount: 10000, email: 'a@b.co', callbackUrl: 'https://app/billing/success' });
    expect(r.authorization_url).toBe('https://checkout.paystack.com/x');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.amount).toBe(1_000_000); // naira -> kobo
    expect(body.currency).toBe('NGN');
    expect(body.reference).toBe(REF);
    expect(String((init.headers as Record<string, string>).Authorization).replace('Bearer ', '')).toBe(SECRET);
  });

  it('throws BILLING_NOT_CONFIGURED without a secret key', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    await expect(initializePaystackTransaction({ reference: REF, amount: 5000, email: 'a@b.co', callbackUrl: 'https://x' })).rejects.toThrow(
      'BILLING_NOT_CONFIGURED',
    );
  });

  it('throws when the provider returns no authorization_url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ status: false, message: 'Invalid key' }) } as unknown as Response));
    await expect(initializePaystackTransaction({ reference: REF, amount: 5000, email: 'a@b.co', callbackUrl: 'https://x' })).rejects.toThrow(
      /PAYSTACK_INIT_FAILED: Invalid key/,
    );
  });
});

describe('verifyPaystackTransaction', () => {
  it('returns status, kobo amount, currency and customer email', async () => {
    stubVerify({ status: 'success', amount: 500000, currency: 'NGN', reference: REF, customer: { email: 'a@b.co' } });
    const v = await verifyPaystackTransaction(REF);
    expect(v).toEqual({ status: 'success', amount: 500000, currency: 'NGN', reference: REF, email: 'a@b.co' });
  });

  it('throws BILLING_NOT_CONFIGURED without a secret key', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    await expect(verifyPaystackTransaction(REF)).rejects.toThrow('BILLING_NOT_CONFIGURED');
  });
});

describe('webhook: signature and shape', () => {
  it('401 without a x-paystack-signature header, before any other work', async () => {
    const res = await webhookPOST(req(chargeSuccess));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('401 on a wrong signature, even by one character', async () => {
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess)).slice(0, -1) + '0'));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('401 when signed with a different secret', async () => {
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess), 'other-secret')));
    expect(res.status).toBe(401);
  });

  it('503 when Paystack is not configured', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const res = await webhookPOST(req(chargeSuccess, 'anything'));
    expect(res.status).toBe(503);
  });

  it('ignores non charge.success events', async () => {
    const body = { event: 'transfer.success', data: { reference: REF } };
    const res = await webhookPOST(req(body, sign(JSON.stringify(body))));
    expect(await res.json()).toEqual({ ok: true, ignored: 'transfer.success' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('tolerates malformed JSON after a valid signature', async () => {
    const raw = 'not-json{{';
    const res = await webhookPOST(req(raw, sign(raw)));
    expect(await res.json()).toEqual({ ok: true, malformed: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('ignores a payload with no reference', async () => {
    const body = { event: 'charge.success', data: { id: 1 } };
    const res = await webhookPOST(req(body, sign(JSON.stringify(body))));
    expect(await res.json()).toEqual({ ok: true, noReference: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('webhook: re-verification and guards', () => {
  it('grants a plan only after re-verifying, with provider paystack', async () => {
    stubVerify({ status: 'success', amount: 1_000_000, currency: 'NGN', reference: REF, customer: { email: 'a@b.co' } });
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, plan: 'PREMIUM' });
    expect(rpc).toHaveBeenCalledWith('apply_verified_payment', {
      p_transaction_id: REF,
      p_tx_ref: REF,
      p_amount: 10000, // kobo -> naira
      p_currency: 'NGN',
      p_email: 'a@b.co',
      p_provider: 'paystack',
    });
    expect(upsert).toHaveBeenCalledWith(
      { event_id: `paystack:${REF}`, event_type: 'charge.success', event_payload: chargeSuccess },
      { onConflict: 'event_id', ignoreDuplicates: true },
    );
  });

  it('maps a ₦20,000 charge (2,000,000 kobo) to the MAX plan', async () => {
    stubVerify({ status: 'success', amount: 2_000_000, currency: 'NGN', reference: REF, customer: { email: 'a@b.co' } });
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(await res.json()).toEqual({ ok: true, plan: 'MAX' });
  });

  it('does not trust a success payload the server re-check disagrees with', async () => {
    stubVerify({ status: 'failed', amount: 1_000_000, currency: 'NGN', reference: REF, customer: { email: 'a@b.co' } });
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(await res.json()).toEqual({ ok: true, verifyStatus: 'failed' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses an unexpected amount (under/over-payment)', async () => {
    stubVerify({ status: 'success', amount: 700_000, currency: 'NGN', reference: REF, customer: { email: 'a@b.co' } });
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a non-NGN currency', async () => {
    stubVerify({ status: 'success', amount: 1_000_000, currency: 'USD', reference: REF, customer: { email: 'a@b.co' } });
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a transaction with no customer email', async () => {
    stubVerify({ status: 'success', amount: 1_000_000, currency: 'NGN', reference: REF, customer: {} });
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not grant when re-verification fails', async () => {
    stubVerify({}, false);
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(res.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not grant when the RPC reports an error', async () => {
    stubVerify({ status: 'success', amount: 1_000_000, currency: 'NGN', reference: REF, customer: { email: 'a@b.co' } });
    rpc.mockResolvedValue({ data: null, error: new Error('USER_NOT_FOUND') });
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(res.status).toBe(500);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('webhook: replay / idempotency', () => {
  it('a replayed reference is short-circuited before re-verification', async () => {
    stubVerify({ status: 'success', amount: 1_000_000, currency: 'NGN', reference: REF, customer: { email: 'a@b.co' } });
    await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(rpc).toHaveBeenCalledTimes(1);

    dedupQuery.mockResolvedValue({ data: { event_id: `paystack:${REF}` }, error: null });
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('fails open on a dedup lookup error (DB is the final idempotency guard)', async () => {
    stubVerify({ status: 'success', amount: 1_000_000, currency: 'NGN', reference: REF, customer: { email: 'a@b.co' } });
    dedupQuery.mockRejectedValue(new Error('db down'));
    const res = await webhookPOST(req(chargeSuccess, sign(JSON.stringify(chargeSuccess))));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('webhook: payload size cap', () => {
  it('rejects oversized bodies with 413 before any DB or external work', async () => {
    const big = JSON.stringify({ ...chargeSuccess, pad: 'x'.repeat(70 * 1024) });
    const res = await webhookPOST(req(big, sign(big)));
    expect(res.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('verify route (reconciliation for missed webhooks)', () => {
  it('403 when the reference does not belong to the caller', async () => {
    const res = await verifyPOST(
      new Request('http://localhost/api/billing/paystack/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: 'pstk_someoneelse_1' }),
      }),
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('applies the payment server-side after re-verification', async () => {
    stubVerify({ status: 'success', amount: 500000, currency: 'NGN', reference: `pstk_u1_1`, customer: { email: 'a@b.co' } });
    const res = await verifyPOST(
      new Request('http://localhost/api/billing/paystack/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: 'pstk_u1_1' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'successful', plan: 'BASIC' });
    expect(rpc).toHaveBeenCalledWith('apply_verified_payment', {
      p_transaction_id: 'pstk_u1_1',
      p_tx_ref: 'pstk_u1_1',
      p_amount: 5000,
      p_currency: 'NGN',
      p_email: 'a@b.co',
      p_provider: 'paystack',
    });
  });

  it('reports a pending transaction without granting', async () => {
    stubVerify({ status: 'abandoned', amount: 500000, currency: 'NGN', reference: 'pstk_u1_1', customer: { email: 'a@b.co' } });
    const res = await verifyPOST(
      new Request('http://localhost/api/billing/paystack/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: 'pstk_u1_1' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'abandoned' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('401 when unauthenticated', async () => {
    requireUser.mockResolvedValue(null);
    const res = await verifyPOST(
      new Request('http://localhost/api/billing/paystack/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: 'pstk_u1_1' }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('providers route (no secrets leave the server)', () => {
  it('reports both providers when both are configured', async () => {
    process.env.FLW_SECRET_KEY = 'sk';
    process.env.FLW_SECRET_HASH = 'h';
    const res = await providersGET(new Request('http://localhost/api/billing/providers'));
    expect(await res.json()).toEqual({ flutterwave: true, paystack: true });
  });

  it('reports paystack false when only flutterwave is configured', async () => {
    process.env.FLW_SECRET_KEY = 'sk';
    process.env.FLW_SECRET_HASH = 'h';
    delete process.env.PAYSTACK_SECRET_KEY;
    const res = await providersGET(new Request('http://localhost/api/billing/providers'));
    expect(await res.json()).toEqual({ flutterwave: true, paystack: false });
  });

  it('reports both false when neither is configured', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const res = await providersGET(new Request('http://localhost/api/billing/providers'));
    expect(await res.json()).toEqual({ flutterwave: false, paystack: false });
  });
});

describe('planForAmount stays the shared plan guard', () => {
  it('still maps exact plan amounts only', () => {
    expect(planForAmount(5000)).toBe('BASIC');
    expect(planForAmount(10000)).toBe('PREMIUM');
    expect(planForAmount(20000)).toBe('MAX');
    expect(planForAmount(7000)).toBeNull();
  });
});
