import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Flutterwave webhook security + idempotency (Phase 9 / QA hardening).
 * The webhook must: verify the signature before anything else, re-verify the
 * transaction server-side (never trust the payload), guard the amount/currency/
 * email, and grant a plan only through the idempotent apply_verified_payment
 * RPC. Replays must be safe (DB-level dedup by tx_ref + event_id).
 */

const { rpc, upsert } = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { rpc, from: () => ({ upsert }) },
}));

import { POST } from '@/app/api/billing/flutterwave/webhook/route';

const SECRET = 'hash_test';

function req(body: unknown, hash?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (hash !== undefined) headers['verif-hash'] = hash;
  return new Request('http://localhost/api/billing/flutterwave/webhook', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function stubVerify(data: Record<string, unknown>, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => ({ status: 'success', data }) } as unknown as Response));
}

const completed = { event: 'charge.completed', event_id: 'evt_1', data: { id: 99, tx_ref: 'aca_u1', status: 'successful' } };

beforeEach(() => {
  process.env.FLW_SECRET_HASH = SECRET;
  process.env.FLW_SECRET_KEY = 'sk_test';
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  upsert.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FLW_SECRET_HASH;
  delete process.env.FLW_SECRET_KEY;
});

describe('webhook signature verification', () => {
  it('401 without a verif-hash header, before any other work', async () => {
    const res = await POST(req(completed));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('401 on a wrong signature (timing-safe comparison)', async () => {
    const res = await POST(req(completed, 'wrong-secret'));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('event filtering (never grants on the wrong event)', () => {
  it('ignores non charge.completed events', async () => {
    const res = await POST(req({ event: 'transfer.completed', event_id: 'evt_2', data: { id: 1, status: 'successful' } }, SECRET));
    expect((await res.json()).ignored).toBe('transfer.completed');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('ignores failed transactions', async () => {
    const res = await POST(req({ event: 'charge.completed', data: { id: 1, status: 'failed' } }, SECRET));
    expect(await res.json()).toEqual({ ok: true, status: 'failed' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('tolerates malformed JSON', async () => {
    const res = await POST(req('not-json{{', SECRET));
    expect(await res.json()).toEqual({ ok: true, malformed: true });
  });
});

describe('server-side re-verification and guards', () => {
  it('grants a plan only after re-verifying, with correct RPC args', async () => {
    stubVerify({ id: 99, tx_ref: 'aca_u1', amount: 10000, currency: 'NGN', status: 'successful', customer: { email: 'a@b.co' } });
    const res = await POST(req(completed, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, plan: 'PREMIUM' });
    expect(rpc).toHaveBeenCalledWith('apply_verified_payment', {
      p_transaction_id: '99',
      p_tx_ref: 'aca_u1',
      p_amount: 10000,
      p_currency: 'NGN',
      p_email: 'a@b.co',
    });
    expect(upsert).toHaveBeenCalledWith(
      { event_id: 'evt_1', event_type: 'charge.completed', event_payload: completed },
      { onConflict: 'event_id', ignoreDuplicates: true },
    );
  });

  it('refuses an unexpected amount (under/over-payment)', async () => {
    stubVerify({ id: 99, tx_ref: 'aca_u1', amount: 7000, currency: 'NGN', status: 'successful', customer: { email: 'a@b.co' } });
    const res = await POST(req(completed, SECRET));
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a non-NGN currency', async () => {
    stubVerify({ id: 99, tx_ref: 'aca_u1', amount: 5000, currency: 'USD', status: 'successful', customer: { email: 'a@b.co' } });
    const res = await POST(req(completed, SECRET));
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a transaction with no customer email', async () => {
    stubVerify({ id: 99, tx_ref: 'aca_u1', amount: 5000, currency: 'NGN', status: 'successful', customer: {} });
    const res = await POST(req(completed, SECRET));
    expect(res.status).toBe(202);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not grant when re-verification fails', async () => {
    stubVerify({}, false);
    const res = await POST(req(completed, SECRET));
    expect(res.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('replay / idempotency contract', () => {
  it('a replayed webhook re-runs the idempotent RPC and upserts with ignoreDuplicates', async () => {
    stubVerify({ id: 99, tx_ref: 'aca_u1', amount: 10000, currency: 'NGN', status: 'successful', customer: { email: 'a@b.co' } });
    await POST(req(completed, SECRET));
    await POST(req(completed, SECRET));
    // The route is stateless; the DB is the idempotency guard (payments.tx_ref
    // unique + payment_events.event_id dedup) so replays are harmless.
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1][1]).toEqual({ onConflict: 'event_id', ignoreDuplicates: true });
  });
});
