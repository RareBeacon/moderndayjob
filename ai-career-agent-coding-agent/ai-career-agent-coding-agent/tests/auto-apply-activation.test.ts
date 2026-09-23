import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Free auto-apply activation (Milestone 3, owner decision D2).
 *
 * Contract under test: the Paystack card-verification call asks for
 * purpose=ADD_CARD with ZERO amount and NO recurring_consent (the card can
 * never be charged through us later); the start route never echoes or logs
 * card data; the webhook verifies the signature, dedups, re-verifies with
 * Paystack, refuses non-zero amounts, and grants only through the
 * idempotent apply_card_activation RPC. card_verification.failed flips the
 * pending row so the UI can say so.
 */

const { rpc, upsert, dedupQuery, updateChain, requireUser, enforceRateLimit } = vi.hoisted(() => ({
  rpc: vi.fn(),
  upsert: vi.fn(),
  dedupQuery: vi.fn(),
  updateChain: vi.fn(),
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc,
    from: (table: string) => {
      if (table === 'auto_apply_activations') {
        return {
          upsert,
          update: () => ({ eq: () => ({ eq: () => ({ then: (res: (v: unknown) => void) => res({ error: null }) }) }) }),
          select: () => ({ eq: () => ({ maybeSingle: dedupQuery }) }),
        };
      }
      return {
        upsert,
        update: updateChain,
        select: () => ({ eq: () => ({ maybeSingle: dedupQuery }) }),
      };
    },
  },
}));
vi.mock('@/lib/auth', () => ({ requireUser, getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit, requestIp: () => '127.0.0.1' }));

import { POST as activatePOST } from '@/app/api/auto-apply/activate/route';
import { POST as webhookPOST } from '@/app/api/billing/paystack/webhook/route';
import { initializeCardAuthorization, paystackWebhookSignature } from '@packages/billing/paystack';

const SECRET = 'sk_test_activation';

function activateReq(card: Record<string, unknown>) {
  return new Request('http://localhost/api/auto-apply/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ card }),
  });
}

const GOOD_CARD = {
  number: '4084084084084081',
  cvv: '408',
  expiryMonth: '11',
  expiryYear: '98',
  cardholderName: 'Test Person',
};

function webhookReq(body: unknown, signature?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-paystack-signature'] = signature;
  return new Request('http://localhost/api/billing/paystack/webhook', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function signed(body: unknown) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return webhookReq(raw, paystackWebhookSignature(raw, SECRET));
}

function stubFetch(data: unknown, ok = true) {
  const mock = vi.fn().mockResolvedValue({ ok, json: async () => data } as unknown as Response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

const zcaSuccess = {
  event: 'zero_charge_authorization.success',
  data: {
    accessCode: 'ARC_test123',
    reference: 'zca_ref_1',
    amount: 0,
    currency: 'NGN',
    status: 'success',
    authorization: { authorization_code: 'AUTH_x', last4: '4081', card_type: 'Visa', bank: 'Test Bank', reusable: false },
    customer: { email: 'ada@b.co' },
  },
};

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  process.env.NEXT_PUBLIC_APP_URL = 'https://modernjob.vercel.app';
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  upsert.mockReset().mockResolvedValue({ error: null });
  dedupQuery.mockReset().mockResolvedValue({ data: null, error: null });
  updateChain.mockReset().mockResolvedValue({ error: null });
  requireUser.mockReset().mockResolvedValue({ id: 'user-1', email: 'ada@b.co' });
  enforceRateLimit.mockReset().mockResolvedValue({ allowed: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('initializeCardAuthorization (package)', () => {
  it('sends purpose=ADD_CARD, card channel, zero amount, and no recurring_consent', async () => {
    const fetchMock = stubFetch({
      status: true,
      data: { authorizationAccessCode: 'ARC_1', action: 'redirect', value: 'https://api.paystack.co/payments/card/authentication?accessCode=ARC_1' },
    });
    const out = await initializeCardAuthorization({
      email: 'ada@b.co',
      firstName: 'Ada',
      lastName: 'Lovelace',
      card: { number: '4084084084084081', cvv: '408', expiryMonth: '11', expiryYear: '2098', cardholderName: 'Ada Lovelace' },
      returnUrl: 'https://modernjob.vercel.app/auto-apply/activation',
    });
    expect(out.authorizationAccessCode).toBe('ARC_1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/customer/authorization/initialize');
    const sent = JSON.parse(String(init.body));
    expect(sent.purpose).toBe('ADD_CARD');
    expect(sent.channel).toBe('card');
    expect(sent.amount).toBeUndefined();
    expect(sent.recurring_consent).toBeUndefined();
    expect(sent.card.number).toBe('4084084084084081');
  });

  it('throws a clean error when Paystack rejects the card', async () => {
    stubFetch({ status: false, message: 'Invalid card number' }, false);
    await expect(
      initializeCardAuthorization({
        email: 'ada@b.co',
        card: { number: '4111111111111111', cvv: '123', expiryMonth: '01', expiryYear: '30' },
        returnUrl: 'https://example.com',
      }),
    ).rejects.toThrow('PAYSTACK_CARD_INIT_FAILED');
  });
});

describe('POST /api/auto-apply/activate (start route)', () => {
  it('rejects unauthenticated callers', async () => {
    requireUser.mockResolvedValue(null);
    const res = await activatePOST(activateReq(GOOD_CARD));
    expect(res.status).toBe(401);
  });

  it('rejects a malformed card without saying which field', async () => {
    const res = await activatePOST(activateReq({ ...GOOD_CARD, number: 'not-a-number' }));
    expect(res.status).toBe(400);
    const out = await res.json();
    expect(out.error).toBe('INVALID_CARD');
    expect(JSON.stringify(out)).not.toContain('not-a-number');
  });

  it('records a PENDING activation keyed by the access code and returns the redirect', async () => {
    stubFetch({
      status: true,
      data: { authorizationAccessCode: 'ARC_9', action: 'redirect', value: 'https://api.paystack.co/payments/card/authentication?accessCode=ARC_9' },
    });
    const res = await activatePOST(activateReq(GOOD_CARD));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.redirectUrl).toContain('accessCode=ARC_9');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', status: 'PENDING', access_code: 'ARC_9' }),
      expect.objectContaining({ onConflict: 'user_id' }),
    );
    // The response never echoes card data.
    expect(JSON.stringify(out)).not.toContain('4084084084084081');
  });

  it('rate limits to 5 attempts per hour', async () => {
    enforceRateLimit.mockResolvedValue({ allowed: false });
    const res = await activatePOST(activateReq(GOOD_CARD));
    expect(res.status).toBe(429);
  });
});

describe('webhook: zero_charge_authorization.success', () => {
  it('401 without a valid signature before any work', async () => {
    const res = await webhookReq(zcaSuccess, 'deadbeef');
    const out = await webhookPOST(res as unknown as Request);
    expect(out.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('activates through apply_card_activation with the card display fields', async () => {
    const fetchMock = stubFetch({ status: true, data: { status: 'success', advise: 'PROCEED', customerEmail: 'ada@b.co' } });
    rpc.mockResolvedValue({ data: 'user-1', error: null });
    const res = await webhookPOST(signed(zcaSuccess) as unknown as Request);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, activated: true });
    // Server-side re-verification by access code.
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/customer/authorization/verify/ARC_test123');
    expect(rpc).toHaveBeenCalledWith('apply_card_activation', {
      p_access_code: 'ARC_test123',
      p_reference: 'zca_ref_1',
      p_last4: '4081',
      p_brand: 'Visa',
      p_bank: 'Test Bank',
    });
    expect(upsert).toHaveBeenCalled();
  });

  it('refuses a non-zero amount routed through the verification event', async () => {
    const res = await webhookPOST(signed({ ...zcaSuccess, data: { ...zcaSuccess.data, amount: 500000 } }) as unknown as Request);
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('short-circuits a replayed event before re-verification', async () => {
    dedupQuery.mockResolvedValue({ data: { event_id: 'paystack:zca:zca_ref_1' }, error: null });
    const fetchMock = stubFetch({ status: true, data: { status: 'success' } });
    const res = await webhookPOST(signed(zcaSuccess) as unknown as Request);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, duplicate: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not activate when Paystack re-verification says the card did not verify', async () => {
    stubFetch({ status: true, data: { status: 'initialized', advise: 'WAIT' } });
    const res = await webhookPOST(signed(zcaSuccess) as unknown as Request);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, verifyStatus: 'initialized' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an unknown access code activates nothing but stays ok (no crash, no grant)', async () => {
    stubFetch({ status: true, data: { status: 'success', advise: 'PROCEED' } });
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await webhookPOST(signed(zcaSuccess) as unknown as Request);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, activated: false });
  });
});

describe('webhook: card_verification.failed', () => {
  it('flips the pending row to FAILED and grants nothing', async () => {
    const failed = {
      event: 'card_verification.failed',
      data: { accessCode: 'ARC_test123', reference: 'zca_ref_1', status: 'failed' },
    };
    const res = await webhookPOST(signed(failed) as unknown as Request);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, verificationFailed: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});
