import { supabaseAdmin } from '@/lib/supabase';
import { normalizeCouponCode, validateCouponForUser, type PaidPlanCode } from '@/lib/billing/coupons';

/**
 * Server-trusted checkout quote (spec Part 15/17).
 *
 * Every checkout start (with or without a coupon) writes a payment_quotes row
 * carrying the exact price the provider will be initialized with. At
 * verification time apply_quoted_payment (SQL) requires the provider's
 * verified amount to match this quote to the cent and grants the QUOTED plan,
 * never a plan derived from the (possibly discounted) amount. The client can
 * never submit or influence a price.
 */
export interface CheckoutQuote {
  reference: string;
  plan: PaidPlanCode;
  currency: 'NGN' | 'USD';
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  couponCode: string | null;
  couponId: string | null;
}

export class CouponApplyError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = 'CouponApplyError';
  }
}

/**
 * Compute and persist the quote for one checkout reference.
 * Throws CouponApplyError when a supplied coupon fails validation (the route
 * maps it to a 422 with the user-facing message).
 */
export async function createCheckoutQuote(params: {
  reference: string;
  userId: string;
  plan: PaidPlanCode;
  currency: 'NGN' | 'USD';
  originalAmount: number;
  couponCode?: string | null;
}): Promise<CheckoutQuote> {
  let validation = null as Awaited<ReturnType<typeof validateCouponForUser>> | null;
  const rawCode = params.couponCode ? normalizeCouponCode(params.couponCode) : '';
  if (rawCode) {
    validation = await validateCouponForUser({
      code: rawCode,
      userId: params.userId,
      plan: params.plan,
      amount: params.originalAmount,
      currency: params.currency,
    });
    if (!validation.ok) {
      throw new CouponApplyError(validation.code, validation.message);
    }
  }

  const quote: CheckoutQuote = {
    reference: params.reference,
    plan: params.plan,
    currency: params.currency,
    originalAmount: params.originalAmount,
    discountAmount: validation?.ok ? validation.discountAmount : 0,
    finalAmount: validation?.ok ? validation.finalAmount : params.originalAmount,
    couponCode: validation?.ok ? validation.code : null,
    couponId: validation?.ok ? validation.couponId : null,
  };

  // Best-effort persistence: a missing quotes table (migration pending) must
  // not break coupon-less checkouts; the webhook then simply falls back to the
  // legacy threshold path. With a coupon applied, though, the quote is
  // REQUIRED (the discounted amount would otherwise never match a plan).
  const { error } = await supabaseAdmin.from('payment_quotes').insert({
    reference: quote.reference,
    user_id: params.userId,
    plan: quote.plan,
    currency: quote.currency,
    original_amount: quote.originalAmount,
    discount_amount: quote.discountAmount,
    final_amount: quote.finalAmount,
    coupon_id: quote.couponId,
    coupon_code: quote.couponCode,
    status: 'QUOTED',
  });
  if (error && quote.couponId) {
    // A coupon checkout without its quote row could never be honored at
    // verification: refuse the checkout rather than charge an ungrantable price.
    throw error;
  }

  return quote;
}

/**
 * Quote-first payment application (used by webhooks + verify routes).
 * Returns the granted plan, or null when no quote exists for this reference
 * (legacy threshold path applies). Never falls back when a quote EXISTS but
 * mismatches: that raises and must surface as ignored/logged, because a
 * discounted payment must never be reinterpreted by amount thresholds.
 */
export async function applyQuotedPayment(params: {
  reference: string;
  provider: string;
  verifiedAmountMajor: number;
  verifiedCurrency: string;
  verifiedEmail: string;
}): Promise<'BASIC' | 'PREMIUM' | 'MAX' | null> {
  const { data, error } = await supabaseAdmin.rpc('apply_quoted_payment', {
    p_reference: params.reference,
    p_provider: params.provider,
    p_verified_amount: params.verifiedAmountMajor,
    p_verified_currency: params.verifiedCurrency,
    p_verified_email: params.verifiedEmail,
  });
  if (error) {
    // Migration not applied yet: the RPC does not exist. Legacy path applies.
    const message = String(error.message ?? '');
    if (
      error.code === 'PGRST202' ||
      /function .* does not exist/i.test(message) ||
      /Could not find the function/i.test(message)
    ) {
      return null;
    }
    throw new Error(message);
  }
  return (data as 'BASIC' | 'PREMIUM' | 'MAX' | null) ?? null;
}
