import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { initializePaystackTransaction, paystackConfigured } from '@packages/billing/paystack';
import { z } from 'zod';

const body = z.object({ plan: z.enum(['BASIC', 'PREMIUM', 'MAX']) });

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
  const { plan } = parsed.data;

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
  const amount = useUsd ? Number(planRecord.amount_usd) : Number(planRecord.amount);

  try {
    const reference = `pstk_${user.id}_${Date.now()}`;
    const init = (cur: 'NGN' | 'USD', amt: number) =>
      initializePaystackTransaction({
        reference,
        amount: amt,
        currency: cur,
        email: user.email ?? '',
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
        metadata: { plan, userId: user.id, product: 'jobiest subscription', currency: cur },
      });
    let result;
    let chargedCurrency = currency;
    try {
      result = await init(currency, amount);
    } catch (firstError) {
      if (currency === 'USD') {
        // The account may not have USD charges enabled: charge Naira instead
        // so checkout still works (the plan is identical either way).
        result = await init('NGN', Number(planRecord.amount));
        chargedCurrency = 'NGN';
        void firstError;
      } else {
        throw firstError;
      }
    }
    return Response.json({ reference, currency: chargedCurrency, data: { authorization_url: result.authorization_url, access_code: result.access_code } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'BILLING_UNAVAILABLE' }, { status: 503 });
  }
}
