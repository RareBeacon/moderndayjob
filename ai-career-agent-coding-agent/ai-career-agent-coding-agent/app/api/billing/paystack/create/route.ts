import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { initializePaystackTransaction, paystackConfigured } from '@packages/billing/paystack';
import { createCheckoutQuote, CouponApplyError } from '@/lib/billing/checkout';
import { z } from 'zod';

const body = z.object({
  plan: z.enum(['BASIC', 'PREMIUM', 'MAX']),
  couponCode: z.string().trim().max(32).optional(),
});

/** POST /api/billing/paystack/create; start a Paystack hosted checkout for a
 *  paid plan. The plan amount comes from subscription_plans (server-side),
 *  never the client. Redirect back to /billing/success after payment; the
 *  grant itself is applied by the signed webhook, never by the redirect. */
export async function POST(req: Request) {
  if (!paystackConfigured()) {
    return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
  }
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  // Same budget as the Flutterwave path: 5 payment starts per hour per user,
  // shared across providers.
  const rate = await enforceRateLimit(`payment:${requestIp(req)}:${user.id}`, 5, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  const { plan, couponCode } = parsed.data;

  const { data: planRecord } = await supabaseAdmin.from('subscription_plans').select('*').eq('code', plan).maybeSingle();
  if (!planRecord) return Response.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });

  // Charge currency follows the visitor's country (server-side decision, so
  // the checkout always matches what the pricing UI resolved from /api/geo):
  // Nigeria pays Naira, everyone else pays USD (Paystack international
  // payments; USD settles in Naira at Paystack's rate). If the account
  // cannot charge USD, fall back to the Naira checkout rather than fail.
  const country = (req.headers.get('x-vercel-ip-country') ?? '').trim().toUpperCase();
  const useUsd = country !== '' && country !== 'NG' && planRecord.amount_usd != null && Number(planRecord.amount_usd) > 0;
  const currency = useUsd ? 'USD' : 'NGN';
  const listAmount = useUsd ? Number(planRecord.amount_usd) : Number(planRecord.amount);
  const reference = `pstk_${user.id}_${Date.now()}`;

  // Server-trusted quote (Part 15): the coupon is validated here, the price is
  // computed here, and the provider is initialized with the QUOTED amount.
  // The client never sends a price; verification must match this quote exactly.
  try {
    let quote;
    try {
      quote = await createCheckoutQuote({
        reference,
        userId: user.id,
        plan,
        currency,
        originalAmount: listAmount,
        couponCode: couponCode ?? null,
      });
    } catch (err) {
      if (err instanceof CouponApplyError) {
        return Response.json({ error: 'COUPON_INVALID', reason: err.reason, message: err.message }, { status: 422 });
      }
      throw err;
    }

    const init = (ref: string, cur: 'NGN' | 'USD', amt: number, q: { couponCode: string | null; originalAmount: number; discountAmount: number; finalAmount: number }) =>
      initializePaystackTransaction({
        reference: ref,
        amount: amt,
        currency: cur,
        email: user.email ?? '',
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
        metadata: {
          plan,
          userId: user.id,
          product: 'jobiest subscription',
          currency: cur,
          couponCode: q.couponCode,
          originalAmount: q.originalAmount,
          discountAmount: q.discountAmount,
          finalAmount: q.finalAmount,
        },
      });

    let result;
    let chargedCurrency = currency;
    let chargedAmount = quote.finalAmount;
    let chargedReference = reference;
    let couponApplied = quote.couponId !== null;
    try {
      result = await init(reference, currency, quote.finalAmount, quote);
    } catch (firstError) {
      // The account may not have USD charges enabled: charge Naira instead so
      // checkout still works (the plan is identical either way). The fallback
      // gets its OWN quote (reference + Naira list price, no coupon: a
      // fixed-amount NGN coupon cannot be honored against a USD quote), so
      // the grant at verification still matches a quote exactly.
      if (currency === 'USD') {
        await supabaseAdmin.from('payment_quotes').update({ status: 'SUPERSEDED' }).eq('reference', reference).then(() => undefined, () => undefined);
        const ngnRef = `${reference}_ngn`;
        const ngnQuote = await createCheckoutQuote({
          reference: ngnRef,
          userId: user.id,
          plan,
          currency: 'NGN',
          originalAmount: Number(planRecord.amount),
          couponCode: null,
        });
        result = await init(ngnRef, 'NGN', ngnQuote.finalAmount, ngnQuote);
        chargedCurrency = 'NGN';
        chargedAmount = ngnQuote.finalAmount;
        chargedReference = ngnRef;
        couponApplied = false;
        void firstError;
      } else {
        throw firstError;
      }
    }
    return Response.json({
      reference: chargedReference,
      currency: chargedCurrency,
      amount: chargedAmount,
      couponApplied,
      data: { authorization_url: result.authorization_url, access_code: result.access_code },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'BILLING_UNAVAILABLE' }, { status: 503 });
  }
}
