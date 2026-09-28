import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Dodo Payments (Merchant of Record, USD path): package helpers + webhook
 * security + create route. Same contract as the Paystack/Flutterwave paths:
 * Standard-Webhooks signature first (timing-safe, over the RAW body), then
 * server-side re-verification (never trust the payload), amount/product/email
 * guards, grant only through the idempotent apply_verified_payment RPC with
 * p_provider='dodo'. Replays safe (payment-id dedup + DB unique tx_ref).
 */

const { rpc, upsert, insert, dedupQuery, profileQuery, taskQuery, requireUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  upsert: vi.fn(),
  insert: vi.fn(),
  dedupQuery: vi.fn(),
  profileQuery: vi.fn(),
  taskQuery: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc,
    from: (table: string) => {
      if (table === 'payment_events') {
        return { upsert, select: () => ({ eq: () => ({ maybeSingle: dedupQuery }) }) };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: profileQuery }) }) }) };
      }
      if (table === 'agent_tasks') {
        return {
          insert,
          select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ maybeSingle: taskQuery }) }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: dedupQuery }) }) };
    },
  },
}));
vi.mock('@/lib/auth', () => ({ requireUser, getUser: vi.fn() }));
vi.mock('@/lib/agent/pipeline', () => ({ runDailyPipeline: vi.fn() }));

import { POST as webhookPOST } from '@/app/api/billing/dodo/webhook/route';
import { POST as createPOST } from '@/app/api/billing/dodo/create/route';
import { GET as providersGET } from '@/app/api/billing/providers/route';
import { verifyDodoWebhookSignature } from '@packages/billing/dodo';

const SECRET = 'whsec_dodo_test';
const WEBHOOK_ID = 'msg_01ABC';
const TS = '1798694400';

function sign(raw: string, secret = SECRET, id = WEBHOOK_ID, ts = TS) {
  const mac = crypto.createHmac('sha256', secret).update(`${id}.${ts}.${raw}`, 'utf8').digest('base64');
  return `v1,${mac}`;
}

function webhookReq(body: unknown, signature?: string, id = WEBHOOK_ID) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': TS,
  };
  if (signature !== undefined) headers['webhook-signature'] = signature;
  return new Request('http://localhost/api/billing/dodo/webhook', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Server-side re-verification stub: GET /payments/{id} on the Dodo API. */
function stubPayment(data: Record<string, unknown>) {
  const fetchMock = vi.fn().mockImplementation((url: string) =>
    Promise.resolve({ ok: true, json: async () => data } as unknown as Response).then((r) => {
      void url;
      return r;
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const succeeded = {
  type: 'payment.succeeded',
  data: {
    payment_id: 'pay_123',
    subscription_id: 'sub_9',
    total_amount: 399,
    currency: 'USD',
    status: 'succeeded',
    product_id: 'pdt_BASIC',
    customer: { email: 'buyer@example.com' },
    metadata: { plan: 'BASIC', userId: 'u1' },
  },
};

beforeEach(() => {
  vi.stubEnv('DODO_PAYMENTS_API_KEY', 'dsk_test_123');
  vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', SECRET);
  rpc.mockReset();
  upsert.mockReset();
  insert.mockReset();
  dedupQuery.mockReset().mockResolvedValue({ data: null });
  profileQuery.mockReset().mockResolvedValue({ data: { user_id: 'u1' } });
  taskQuery.mockReset().mockResolvedValue({ data: null });
  rpc.mockResolvedValue({ data: null, error: null });
  upsert.mockResolvedValue({ error: null });
  insert.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('verifyDodoWebhookSignature (Standard Webhooks)', () => {
  const raw = JSON.stringify({ type: 'payment.succeeded' });

  it('accepts a correctly signed payload', () => {
    expect(verifyDodoWebhookSignature(raw, WEBHOOK_ID, TS, sign(raw), SECRET)).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const sig = sign(raw);
    expect(verifyDodoWebhookSignature(raw + ' ', WEBHOOK_ID, TS, sig, SECRET)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyDodoWebhookSignature(raw, WEBHOOK_ID, TS, sign(raw, 'whsec_other'), SECRET)).toBe(false);
  });

  it('rejects missing headers or secret', () => {
    expect(verifyDodoWebhookSignature(raw, null, TS, sign(raw), SECRET)).toBe(false);
    expect(verifyDodoWebhookSignature(raw, WEBHOOK_ID, TS, sign(raw), '')).toBe(false);
    expect(verifyDodoWebhookSignature(raw, WEBHOOK_ID, TS, null, SECRET)).toBe(false);
  });

  it('accepts any valid entry among multiple space-separated signatures', () => {
    const bad = 'v1,' + Buffer.from('not-the-signature').toString('base64');
    expect(verifyDodoWebhookSignature(raw, WEBHOOK_ID, TS, `${bad} ${sign(raw)}`, SECRET)).toBe(true);
  });

  it('ignores unknown signature schemes', () => {
    expect(verifyDodoWebhookSignature(raw, WEBHOOK_ID, TS, 'v2,AAAA', SECRET)).toBe(false);
  });
});

describe('POST /api/billing/dodo/webhook', () => {
  it('rejects an unsigned request with 401', async () => {
    const res = await webhookPOST(webhookReq(succeeded));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a bad signature even for a well-formed payload', async () => {
    const res = await webhookPOST(webhookReq(succeeded, 'v1,AAAA'));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('acks non-payment events without granting', async () => {
    stubPayment({});
    const res = await webhookPOST(webhookReq({ type: 'subscription.cancelled', data: { subscription_id: 'sub_9' } }, sign(JSON.stringify({ type: 'subscription.cancelled', data: { subscription_id: 'sub_9' } }))));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: 'subscription.cancelled' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('short-circuits a replayed payment id', async () => {
    dedupQuery.mockResolvedValue({ data: { event_id: 'dodo:pay_123' } });
    stubPayment({});
    const raw = JSON.stringify(succeeded);
    const res = await webhookPOST(webhookReq(succeeded, sign(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('grants a plan only after server-side re-verification, with provider dodo', async () => {
    const fetchMock = stubPayment({ payment_id: 'pay_123', status: 'succeeded', total_amount: 399, currency: 'USD', product_id: 'pdt_BASIC', customer: { email: 'buyer@example.com' } });
    const raw = JSON.stringify(succeeded);
    const res = await webhookPOST(webhookReq(succeeded, sign(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, plan: 'BASIC' });
    // Re-verified against the API, not the payload:
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/payments/pay_123'), expect.anything());
    expect(rpc).toHaveBeenCalledWith('apply_verified_payment', {
      p_transaction_id: 'pay_123',
      p_tx_ref: 'pay_123',
      p_amount: 3.99,
      p_currency: 'USD',
      p_email: 'buyer@example.com',
      p_provider: 'dodo',
    });
    expect(upsert).toHaveBeenCalledWith(
      { event_id: 'dodo:pay_123', event_type: 'payment.succeeded', event_payload: succeeded },
      { onConflict: 'event_id', ignoreDuplicates: true },
    );
    // The paid user's agent is queued to start work:
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', type: 'JOB_DISCOVERY', status: 'QUEUED' }),
    );
  });

  it('maps $14.99 to the MAX plan', async () => {
    stubPayment({ payment_id: 'pay_max', status: 'succeeded', total_amount: 1499, currency: 'USD', customer: { email: 'm@example.com' } });
    const body = { type: 'payment.succeeded', data: { payment_id: 'pay_max', total_amount: 1499, currency: 'USD' } };
    const raw = JSON.stringify(body);
    const res = await webhookPOST(webhookReq(body, sign(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, plan: 'MAX' });
  });

  it('refuses an amount below every plan', async () => {
    stubPayment({ payment_id: 'pay_odd', status: 'succeeded', total_amount: 100, currency: 'USD', customer: { email: 'x@example.com' } });
    const body = { type: 'payment.succeeded', data: { payment_id: 'pay_odd', total_amount: 100 } };
    const raw = JSON.stringify(body);
    const res = await webhookPOST(webhookReq(body, sign(raw)));
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('grants the covered plan on an over-payment (MoR tax added on top)', async () => {
    // $3.99 + ~20% VAT = $4.79: same FX-markup tolerance as the other providers.
    stubPayment({ payment_id: 'pay_tax', status: 'succeeded', total_amount: 479, currency: 'USD', customer: { email: 'eu@example.com' } });
    const body = { type: 'payment.succeeded', data: { payment_id: 'pay_tax', total_amount: 479 } };
    const raw = JSON.stringify(body);
    const res = await webhookPOST(webhookReq(body, sign(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, plan: 'BASIC' });
  });

  it('refuses when the product and the charged amount disagree', async () => {
    vi.stubEnv('DODO_PRODUCT_BASIC', 'pdt_BASIC');
    // $3.99 charged on a product mapped to PREMIUM: refuse rather than guess.
    stubPayment({ payment_id: 'pay_mix', status: 'succeeded', total_amount: 399, currency: 'USD', product_id: 'pdt_PREMIUM', customer: { email: 'x@example.com' } });
    vi.stubEnv('DODO_PRODUCT_PREMIUM', 'pdt_PREMIUM');
    const body = { type: 'payment.succeeded', data: { payment_id: 'pay_mix', total_amount: 399, product_id: 'pdt_PREMIUM' } };
    const raw = JSON.stringify(body);
    const res = await webhookPOST(webhookReq(body, sign(raw)));
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not grant when the re-verified status is not succeeded', async () => {
    stubPayment({ payment_id: 'pay_p', status: 'pending', total_amount: 399, currency: 'USD', customer: { email: 'x@example.com' } });
    const body = { type: 'payment.succeeded', data: { payment_id: 'pay_p' } };
    const raw = JSON.stringify(body);
    const res = await webhookPOST(webhookReq(body, sign(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, verifyStatus: 'pending' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('acks malformed JSON after a valid signature', async () => {
    const raw = '{not json';
    const res = await webhookPOST(webhookReq(raw, sign(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, malformed: true });
  });

  it('returns 503 when the webhook key is not configured', async () => {
    vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', '');
    const res = await webhookPOST(webhookReq(succeeded, sign(JSON.stringify(succeeded))));
    expect(res.status).toBe(503);
  });
});

describe('POST /api/billing/dodo/create', () => {
  it('returns 503 when Dodo is not configured', async () => {
    vi.stubEnv('DODO_PAYMENTS_API_KEY', '');
    const res = await createPOST(new Request('http://localhost/api/billing/dodo/create', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(503);
  });

  it('requires a signed-in user', async () => {
    requireUser.mockRejectedValue(new Error('no session'));
    const res = await createPOST(new Request('http://localhost/api/billing/dodo/create', { method: 'POST', body: JSON.stringify({ plan: 'BASIC' }) }));
    expect(res.status).toBe(401);
  });

  it('creates a checkout session with the env product for the plan', async () => {
    requireUser.mockResolvedValue({ id: 'u1', email: 'buyer@example.com' });
    vi.stubEnv('DODO_PRODUCT_BASIC', 'pdt_BASIC');
    dedupQuery.mockResolvedValue({ data: { code: 'BASIC', amount: 5000, amount_usd: 3.99 } }); // subscription_plans lookup
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 'cks_1', checkout_url: 'https://test.checkout.dodopayments.com/session/cks_1' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const res = await createPOST(new Request('http://localhost/api/billing/dodo/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'BASIC' }),
    }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { currency: string; data: { checkout_url: string } };
    expect(j.currency).toBe('USD');
    expect(j.data.checkout_url).toContain('checkout.dodopayments.com');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://test.dodopayments.com/checkouts');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer dsk_test_123');
    const sent = JSON.parse(String(init.body));
    expect(sent.product_cart).toEqual([{ product_id: 'pdt_BASIC', quantity: 1 }]);
    expect(sent.customer.email).toBe('buyer@example.com');
    expect(sent.metadata).toMatchObject({ plan: 'BASIC', userId: 'u1' });
  });

  it('refuses a plan with no configured product', async () => {
    requireUser.mockResolvedValue({ id: 'u1', email: 'buyer@example.com' });
    dedupQuery.mockResolvedValue({ data: { code: 'MAX', amount: 20000, amount_usd: 14.99 } });
    const res = await createPOST(new Request('http://localhost/api/billing/dodo/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'MAX' }),
    }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'PLAN_NOT_CONFIGURED' });
  });
});

describe('GET /api/billing/providers (dodo flag)', () => {
  it('reports dodo availability as a boolean', async () => {
    const res = await providersGET(new Request('http://localhost/api/billing/providers'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { dodo: boolean };
    expect(typeof j.dodo).toBe('boolean');
    expect(j.dodo).toBe(true); // DODO_PAYMENTS_API_KEY stubbed in beforeEach
  });
});
