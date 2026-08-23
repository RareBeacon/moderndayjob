import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFlutterwaveTransaction,
  verifyFlutterwaveTransaction,
  planForAmount,
  PLAN_AMOUNTS_NGN,
} from '@packages/billing/flutterwave';

beforeEach(() => {
  process.env.FLW_SECRET_KEY = 'sk_test';
  process.env.FLW_SECRET_HASH = 'hash_test';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FLW_SECRET_KEY;
  delete process.env.FLW_SECRET_HASH;
});

function mockFetch(resp: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => resp } as unknown as Response));
}

const baseInput = {
  tx_ref: 'aca_user_1',
  amount: 5000,
  redirect_url: 'https://app/billing/success',
  customer: { email: 'a@b.co' },
};

describe('flutterwave createFlutterwaveTransaction', () => {
  it('returns the hosted checkout link on success', async () => {
    mockFetch({ status: 'success', data: { link: 'https://checkout.flutterwave.com/x' } });
    const r = await createFlutterwaveTransaction(baseInput);
    expect(r.link).toBe('https://checkout.flutterwave.com/x');
  });

  it('throws BILLING_NOT_CONFIGURED without keys', async () => {
    delete process.env.FLW_SECRET_KEY;
    await expect(createFlutterwaveTransaction(baseInput)).rejects.toThrow('BILLING_NOT_CONFIGURED');
  });

  it('throws when the provider returns no link', async () => {
    mockFetch({ status: 'error', data: {} });
    await expect(createFlutterwaveTransaction(baseInput)).rejects.toThrow();
  });
});

describe('flutterwave verifyFlutterwaveTransaction', () => {
  it('returns verified transaction data', async () => {
    mockFetch({
      status: 'success',
      data: { id: 99, tx_ref: 'aca_user_1', amount: 10000, currency: 'NGN', status: 'successful', customer: { email: 'a@b.co' } },
    });
    const v = await verifyFlutterwaveTransaction(99);
    expect(v.status).toBe('successful');
    expect(v.amount).toBe(10000);
    expect(v.currency).toBe('NGN');
  });
});

describe('planForAmount (webhook guard)', () => {
  it('maps known plan amounts', () => {
    expect(planForAmount(PLAN_AMOUNTS_NGN.BASIC)).toBe('BASIC');
    expect(planForAmount(PLAN_AMOUNTS_NGN.PREMIUM)).toBe('PREMIUM');
  });

  it('rejects unexpected amounts (under/over-payment)', () => {
    expect(planForAmount(100)).toBeNull();
    expect(planForAmount(4999)).toBeNull();
    expect(planForAmount(0)).toBeNull();
    expect(planForAmount(7000)).toBeNull();
  });
});
