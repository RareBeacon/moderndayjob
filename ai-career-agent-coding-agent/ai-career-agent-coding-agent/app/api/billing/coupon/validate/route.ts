import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { validateCouponForUser } from '@/lib/billing/coupons';

/**
 * POST /api/billing/coupon/validate (authenticated user, spec Part 14).
 *
 * The user asks "does my coupon work for this plan?" The server alone decides:
 * it resolves the plan price from subscription_plans (never the client),
 * applies the same geo currency rule as checkout, and returns the computed
 * original/discount/final price. The client never calculates a discount.
 *
 * Rate limited hard: coupon codes must not be brute-forceable (Part 16).
 */

const body = z.object({
  code: z.string().trim().min(3).max(32),
  plan: z.enum(['BASIC', 'PREMIUM', 'MAX']),
});

export async function POST(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`coupon:validate:${requestIp(req)}:${user.id}`, 10, '10 m');
  if (!rl.allowed) {
    return Response.json({ error: 'RATE_LIMITED', message: 'Too many coupon attempts. Please wait a few minutes.' }, { status: 429 });
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });

  const { code, plan } = parsed.data;

  const { data: planRecord } = await supabaseAdmin
    .from('subscription_plans')
    .select('amount, amount_usd')
    .eq('code', plan)
    .maybeSingle();
  if (!planRecord) return Response.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });

  // Same geo rule as /api/billing/paystack/create: NG pays Naira, others USD.
  const country = (req.headers.get('x-vercel-ip-country') ?? '').trim().toUpperCase();
  const useUsd = country !== '' && country !== 'NG' && planRecord.amount_usd != null && Number(planRecord.amount_usd) > 0;
  const currency = useUsd ? 'USD' : 'NGN';
  const amount = useUsd ? Number(planRecord.amount_usd) : Number(planRecord.amount);

  let validation;
  try {
    validation = await validateCouponForUser({ code, userId: user.id, plan, amount, currency });
  } catch {
    return Response.json({ error: 'COUPON_CHECK_FAILED', message: 'Unable to check this coupon right now. Please try again.' }, { status: 500 });
  }

  if (!validation.ok) {
    return Response.json({ ok: false, reason: validation.code, message: validation.message }, { status: 200 });
  }

  return Response.json({
    ok: true,
    code: validation.code,
    plan,
    currency,
    originalAmount: validation.originalAmount,
    discountAmount: validation.discountAmount,
    finalAmount: validation.finalAmount,
  });
}
