import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coupon engine (migration 043 / lib/billing/coupons.ts).
 * The pure evaluator covers every validation rule from the spec (Part 14/16):
 * existence is the DB wrapper's job; every other check, the price math, and
 * the rounding are exercised here exhaustively.
 */

const { couponSelect, redemptionCount, quoteInsert } = vi.hoisted(() => ({
  couponSelect: vi.fn(),
  redemptionCount: vi.fn(),
  quoteInsert: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'coupons') {
        return { select: () => ({ eq: () => ({ maybeSingle: couponSelect }) }) };
      }
      if (table === 'coupon_redemptions') {
        return { select: () => ({ eq: () => ({ eq: redemptionCount }) }) };
      }
      if (table === 'payment_quotes') {
        return { insert: quoteInsert };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import {
  evaluateCoupon,
  normalizeCouponCode,
  round2,
  validateCouponForUser,
  COUPON_MESSAGES,
  type CouponRow,
} from '@/lib/billing/coupons';

function coupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: 'c1',
    code: 'JOBIEST50',
    description: null,
    discount_type: 'PERCENTAGE',
    discount_value: 50,
    currency: 'NGN',
    applicable_plans: ['BASIC', 'PREMIUM', 'MAX'],
    min_purchase_amount: null,
    max_discount_amount: null,
    usage_limit: 100,
    usage_count: 0,
    per_user_limit: 1,
    starts_at: '2026-01-01T00:00:00Z',
    expires_at: null,
    is_active: true,
    ...overrides,
  };
}

const INPUT = { plan: 'PREMIUM' as const, amount: 10000, currency: 'NGN', userRedemptionCount: 0, now: new Date('2026-10-07T12:00:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeCouponCode + round2', () => {
  it('uppercases and trims', () => {
    expect(normalizeCouponCode('  jobiest50 ')).toBe('JOBIEST50');
    expect(normalizeCouponCode('a b c')).toBe('ABC');
  });
  it('rounds to two decimals without float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(3333.333)).toBe(3333.33);
  });
});

describe('evaluateCoupon: acceptance + math', () => {
  it('accepts a valid percentage coupon and halves the price', () => {
    const r = evaluateCoupon(coupon(), INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.originalAmount).toBe(10000);
      expect(r.discountAmount).toBe(5000);
      expect(r.finalAmount).toBe(5000);
    }
  });

  it('accepts a 100% coupon (beta promos) and yields a zero final', () => {
    const r = evaluateCoupon(coupon({ code: 'BETA100', discount_value: 100 }), INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finalAmount).toBe(0);
  });

  it('caps a percentage discount at max_discount_amount', () => {
    const r = evaluateCoupon(coupon({ discount_value: 50, max_discount_amount: 2000 }), INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountAmount).toBe(2000);
      expect(r.finalAmount).toBe(8000);
    }
  });

  it('applies fixed-amount discounts in the matching currency', () => {
    const r = evaluateCoupon(
      coupon({ discount_type: 'FIXED_AMOUNT', discount_value: 5000, currency: 'NGN' }),
      INPUT,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountAmount).toBe(5000);
      expect(r.finalAmount).toBe(5000);
    }
  });

  it('accepts a USD fixed coupon on a USD charge', () => {
    const r = evaluateCoupon(
      coupon({ discount_type: 'FIXED_AMOUNT', discount_value: 2, currency: 'USD' }),
      { ...INPUT, amount: 7.99, currency: 'USD' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finalAmount).toBe(5.99);
  });
});

describe('evaluateCoupon: every rejection rule (spec Part 14/16/27)', () => {
  it('inactive coupon', () => {
    const r = evaluateCoupon(coupon({ is_active: false }), INPUT);
    expect(r).toMatchObject({ ok: false, code: 'INACTIVE', message: COUPON_MESSAGES.INACTIVE });
  });

  it('not yet started', () => {
    const r = evaluateCoupon(coupon({ starts_at: '2026-10-08T00:00:00Z' }), INPUT);
    expect(r).toMatchObject({ ok: false, code: 'NOT_STARTED' });
  });

  it('expired', () => {
    const r = evaluateCoupon(coupon({ expires_at: '2026-10-01T00:00:00Z' }), INPUT);
    expect(r).toMatchObject({ ok: false, code: 'EXPIRED', message: 'This coupon has expired.' });
  });

  it('global usage limit reached', () => {
    const r = evaluateCoupon(coupon({ usage_limit: 100, usage_count: 100 }), INPUT);
    expect(r).toMatchObject({ ok: false, code: 'USAGE_LIMIT', message: 'This coupon is no longer available.' });
  });

  it('per-user limit reached', () => {
    const r = evaluateCoupon(coupon({ per_user_limit: 1 }), { ...INPUT, userRedemptionCount: 1 });
    expect(r).toMatchObject({ ok: false, code: 'PER_USER_LIMIT', message: 'You have already used this coupon.' });
  });

  it('plan not eligible', () => {
    const r = evaluateCoupon(coupon({ applicable_plans: ['PREMIUM'] }), { ...INPUT, plan: 'BASIC' });
    expect(r).toMatchObject({ ok: false, code: 'PLAN_NOT_ELIGIBLE', message: 'This coupon is not valid for the selected plan.' });
  });

  it('fixed-amount coupon in another currency', () => {
    const r = evaluateCoupon(coupon({ discount_type: 'FIXED_AMOUNT', currency: 'NGN' }), { ...INPUT, currency: 'USD', amount: 7.99 });
    expect(r).toMatchObject({ ok: false, code: 'CURRENCY_MISMATCH' });
  });

  it('minimum purchase not met', () => {
    const r = evaluateCoupon(coupon({ min_purchase_amount: 15000 }), INPUT);
    expect(r).toMatchObject({ ok: false, code: 'MIN_PURCHASE', message: 'This purchase does not meet the coupon minimum.' });
  });

  it('percentage above 100 is invalid (defensive)', () => {
    const r = evaluateCoupon(coupon({ discount_value: 150 }), INPUT);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_DISCOUNT' });
  });

  it('fixed discount larger than the price is clamped (never a negative total)', () => {
    const r = evaluateCoupon(coupon({ discount_type: 'FIXED_AMOUNT', discount_value: 20000, currency: 'NGN' }), INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountAmount).toBe(10000);
      expect(r.finalAmount).toBe(0);
    }
  });

  it('zero or non-finite values are invalid', () => {
    expect(evaluateCoupon(coupon({ discount_value: 0 }), INPUT)).toMatchObject({ ok: false, code: 'INVALID_DISCOUNT' });
    expect(evaluateCoupon(coupon({ discount_value: NaN }), INPUT)).toMatchObject({ ok: false, code: 'INVALID_DISCOUNT' });
  });
});

describe('validateCouponForUser (DB wrapper)', () => {
  it('rejects unknown codes with the generic invalid message', async () => {
    couponSelect.mockResolvedValue({ data: null, error: null });
    const r = await validateCouponForUser({ code: 'NOSUCH', userId: 'u1', plan: 'PREMIUM', amount: 10000, currency: 'NGN' });
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND', message: 'This coupon code is invalid.' });
  });

  it('rejects malformed codes before touching the database', async () => {
    const r = await validateCouponForUser({ code: 'x', userId: 'u1', plan: 'PREMIUM', amount: 10000, currency: 'NGN' });
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(couponSelect).not.toHaveBeenCalled();
  });

  it('counts the user redemptions and enforces the per-user limit', async () => {
    couponSelect.mockResolvedValue({ data: coupon({ per_user_limit: 2 }), error: null });
    redemptionCount.mockResolvedValue({ count: 2, error: null });
    const r = await validateCouponForUser({ code: 'JOBIEST50', userId: 'u1', plan: 'PREMIUM', amount: 10000, currency: 'NGN' });
    expect(r).toMatchObject({ ok: false, code: 'PER_USER_LIMIT' });
  });

  it('returns the trusted price for a valid coupon', async () => {
    couponSelect.mockResolvedValue({ data: coupon(), error: null });
    redemptionCount.mockResolvedValue({ count: 0, error: null });
    const r = await validateCouponForUser({ code: 'jobiest50', userId: 'u1', plan: 'PREMIUM', amount: 10000, currency: 'NGN' });
    expect(r).toMatchObject({ ok: true, finalAmount: 5000, discountAmount: 5000 });
  });

  it('treats a missing coupons table (migration pending) as an invalid coupon, never a crash', async () => {
    couponSelect.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.coupons'" } });
    const r = await validateCouponForUser({ code: 'JOBIEST50', userId: 'u1', plan: 'PREMIUM', amount: 10000, currency: 'NGN' });
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
