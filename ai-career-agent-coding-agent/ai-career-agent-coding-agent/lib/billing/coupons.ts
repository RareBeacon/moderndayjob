import { supabaseAdmin } from '@/lib/supabase';

/**
 * Coupon / promotion engine (server-side only).
 *
 * SECURITY MODEL (spec Part 14-16):
 *  - The client may only ever send a coupon CODE string. Every check and every
 *    price calculation happens here, on the server, against the coupons table.
 *  - validateCouponForUser performs the full 10-point validation and returns
 *    the trusted price. The checkout route persists that price as a
 *    payment_quotes row; the payment provider is initialized with the QUOTED
 *    amount, and verification must match the quote exactly (the DB function
 *    apply_quoted_payment enforces this atomically).
 *  - Redemption is recorded only after a payment is verified server-side
 *    (inside apply_quoted_payment), never when a checkout page opens.
 *
 * LIMIT ENFORCEMENT (documented trade-off):
 *  - usage_limit / per_user_limit / window / plan eligibility are enforced
 *    strictly at validation (quote) time, which is what users experience.
 *  - At redemption time a payer is never punished for a race: someone who was
 *    quoted and PAID always receives the plan they paid for. The unique
 *    constraint on coupon_redemptions.payment_tx_ref guarantees one payment
 *    can never redeem or count twice.
 */

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type PaidPlanCode = 'BASIC' | 'PREMIUM' | 'MAX';

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: string | number;
  currency: string;
  applicable_plans: string[] | null;
  min_purchase_amount: string | number | null;
  max_discount_amount: string | number | null;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export type CouponRejectCode =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'NOT_STARTED'
  | 'USAGE_LIMIT'
  | 'PER_USER_LIMIT'
  | 'PLAN_NOT_ELIGIBLE'
  | 'CURRENCY_MISMATCH'
  | 'MIN_PURCHASE'
  | 'INVALID_DISCOUNT';

/** User-facing messages (spec Part 27). Never raw database errors. */
export const COUPON_MESSAGES: Record<CouponRejectCode, string> = {
  NOT_FOUND: 'This coupon code is invalid.',
  INACTIVE: 'This coupon is no longer available.',
  EXPIRED: 'This coupon has expired.',
  NOT_STARTED: 'This coupon is not available yet.',
  USAGE_LIMIT: 'This coupon is no longer available.',
  PER_USER_LIMIT: 'You have already used this coupon.',
  PLAN_NOT_ELIGIBLE: 'This coupon is not valid for the selected plan.',
  CURRENCY_MISMATCH: 'This coupon is not valid for this currency.',
  MIN_PURCHASE: 'This purchase does not meet the coupon minimum.',
  INVALID_DISCOUNT: 'This coupon discount is not valid for this plan.',
};

export interface CouponPrice {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  currency: string;
}

export type CouponValidation =
  | ({ ok: true; couponId: string; code: string } & CouponPrice)
  | { ok: false; code: CouponRejectCode; message: string };

/** Normalize a coupon code: trim, uppercase, collapse inner spaces. */
export function normalizeCouponCode(raw: string): string {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface EvaluateCouponInput {
  plan: PaidPlanCode;
  amount: number;
  currency: string;
  /** How many times THIS user has already redeemed this coupon (completed payments). */
  userRedemptionCount: number;
  /** Server time override for tests. */
  now?: Date;
}

/**
 * Pure validation + price calculation. Same rules the DB re-checks at
 * redemption; kept pure so every branch is unit-testable without a database.
 */
export function evaluateCoupon(coupon: CouponRow, input: EvaluateCouponInput): CouponValidation {
  const now = input.now ?? new Date();

  if (!coupon.is_active) return { ok: false, code: 'INACTIVE', message: COUPON_MESSAGES.INACTIVE };

  const startsAt = coupon.starts_at ? new Date(coupon.starts_at) : null;
  if (startsAt && startsAt.getTime() > now.getTime()) {
    return { ok: false, code: 'NOT_STARTED', message: COUPON_MESSAGES.NOT_STARTED };
  }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now.getTime()) {
    return { ok: false, code: 'EXPIRED', message: COUPON_MESSAGES.EXPIRED };
  }

  if (coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit) {
    return { ok: false, code: 'USAGE_LIMIT', message: COUPON_MESSAGES.USAGE_LIMIT };
  }

  if (input.userRedemptionCount >= coupon.per_user_limit) {
    return { ok: false, code: 'PER_USER_LIMIT', message: COUPON_MESSAGES.PER_USER_LIMIT };
  }

  const plans = coupon.applicable_plans ?? [];
  if (!plans.includes(input.plan)) {
    return { ok: false, code: 'PLAN_NOT_ELIGIBLE', message: COUPON_MESSAGES.PLAN_NOT_ELIGIBLE };
  }

  const value = Number(coupon.discount_value);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, code: 'INVALID_DISCOUNT', message: COUPON_MESSAGES.INVALID_DISCOUNT };
  }

  let discount: number;
  if (coupon.discount_type === 'PERCENTAGE') {
    if (value > 100) return { ok: false, code: 'INVALID_DISCOUNT', message: COUPON_MESSAGES.INVALID_DISCOUNT };
    discount = (input.amount * value) / 100;
    const cap = coupon.max_discount_amount != null ? Number(coupon.max_discount_amount) : null;
    if (cap != null && Number.isFinite(cap) && cap >= 0) discount = Math.min(discount, cap);
  } else {
    // FIXED_AMOUNT: the coupon's currency must match the charge currency.
    if ((coupon.currency ?? 'NGN').toUpperCase() !== input.currency.toUpperCase()) {
      return { ok: false, code: 'CURRENCY_MISMATCH', message: COUPON_MESSAGES.CURRENCY_MISMATCH };
    }
    discount = value;
    const minPurchase = coupon.min_purchase_amount != null ? Number(coupon.min_purchase_amount) : null;
    if (minPurchase != null && input.amount < minPurchase) {
      return { ok: false, code: 'MIN_PURCHASE', message: COUPON_MESSAGES.MIN_PURCHASE };
    }
  }
  if (coupon.discount_type === 'PERCENTAGE') {
    const minPurchase = coupon.min_purchase_amount != null ? Number(coupon.min_purchase_amount) : null;
    if (minPurchase != null && input.amount < minPurchase) {
      return { ok: false, code: 'MIN_PURCHASE', message: COUPON_MESSAGES.MIN_PURCHASE };
    }
  }

  discount = round2(Math.min(discount, input.amount));
  const finalAmount = round2(input.amount - discount);
  if (finalAmount < 0 || !Number.isFinite(finalAmount)) {
    return { ok: false, code: 'INVALID_DISCOUNT', message: COUPON_MESSAGES.INVALID_DISCOUNT };
  }

  return {
    ok: true,
    couponId: coupon.id,
    code: coupon.code,
    originalAmount: round2(input.amount),
    discountAmount: discount,
    finalAmount,
    currency: input.currency,
  };
}

/** True when the Supabase error means "migration 043 not applied yet". */
export function isCouponsNotMigrated(error: { code?: string; message?: string } | null): boolean {
  const message = String(error?.message ?? '');
  return (
    error?.code === 'PGRST205' || // table missing from schema cache
    error?.code === 'PGRST204' || // column missing
    error?.code === '42703' || // undefined column (Postgres)
    error?.code === '42P01' || // undefined table (Postgres)
    /Could not find the table/.test(message) ||
    /does not exist/.test(message)
  );
}

/** How many times this user has completed a redemption of this coupon. */
export async function countUserRedemptions(couponId: string, userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('coupon_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', couponId)
    .eq('user_id', userId);
  if (error) {
    if (isCouponsNotMigrated(error)) return 0;
    throw error;
  }
  return count ?? 0;
}

/** Full validation for a user + plan + price. DB-backed wrapper around the pure core. */
export async function validateCouponForUser(params: {
  code: string;
  userId: string;
  plan: PaidPlanCode;
  amount: number;
  currency: string;
}): Promise<CouponValidation> {
  const code = normalizeCouponCode(params.code);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return { ok: false, code: 'NOT_FOUND', message: COUPON_MESSAGES.NOT_FOUND };
  }

  const { data: coupon, error } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) {
    if (isCouponsNotMigrated(error)) {
      return { ok: false, code: 'NOT_FOUND', message: COUPON_MESSAGES.NOT_FOUND };
    }
    throw error;
  }
  if (!coupon) return { ok: false, code: 'NOT_FOUND', message: COUPON_MESSAGES.NOT_FOUND };

  const used = await countUserRedemptions(coupon.id, params.userId);

  return evaluateCoupon(coupon as unknown as CouponRow, {
    plan: params.plan,
    amount: params.amount,
    currency: params.currency,
    userRedemptionCount: used,
  });
}
