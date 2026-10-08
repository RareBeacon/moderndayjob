import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { createFlutterwaveTransaction } from '@packages/billing/flutterwave';
import { createCheckoutQuote, CouponApplyError } from '@/lib/billing/checkout';
import { z } from 'zod';

const body = z.object({
  plan: z.enum(['BASIC', 'PREMIUM', 'MAX']),
  couponCode: z.string().trim().max(32).optional(),
});

/** POST /api/billing/flutterwave/create; start a hosted checkout for a paid
 *  plan. The plan amount comes from subscription_plans (server-side), never
 *  the client. Redirect back to /billing/success after payment. */
export async function POST(req: Request) {
  if (!process.env.FLW_SECRET_KEY || !process.env.FLW_SECRET_HASH) {
    return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
  }
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rate = await enforceRateLimit(`payment:${requestIp(req)}:${user.id}`, 5, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  const { plan, couponCode } = parsed.data;
  const { data: planRecord } = await supabaseAdmin.from('subscription_plans').select('*').eq('code', plan).single();
  if (!planRecord) return Response.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });

  try {
    const txRef = `aca_${user.id}_${Date.now()}`;
    // Server-trusted quote: coupon validated + price computed here; the
    // provider is initialized with the quoted amount only (Part 15/17).
    let quote;
    try {
      quote = await createCheckoutQuote({
        reference: txRef,
        userId: user.id,
        plan,
        currency: 'NGN',
        originalAmount: Number(planRecord.amount),
        couponCode: couponCode ?? null,
      });
    } catch (err) {
      if (err instanceof CouponApplyError) {
        return Response.json({ error: 'COUPON_INVALID', reason: err.reason, message: err.message }, { status: 422 });
      }
      throw err;
    }
    const result = await createFlutterwaveTransaction({
      tx_ref: txRef,
      amount: quote.finalAmount,
      currency: 'NGN',
      redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
      customer: { email: user.email ?? '' },
      customizations: { title: 'Jobiest', description: `${plan} subscription${quote.couponCode ? ` (coupon ${quote.couponCode})` : ''}` },
    });
    return Response.json({ tx_ref: txRef, amount: quote.finalAmount, couponApplied: quote.couponId !== null, data: result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'BILLING_UNAVAILABLE' }, { status: 503 });
  }
}
