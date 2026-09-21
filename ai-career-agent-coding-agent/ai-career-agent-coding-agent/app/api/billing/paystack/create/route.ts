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

  try {
    const reference = `pstk_${user.id}_${Date.now()}`;
    const result = await initializePaystackTransaction({
      reference,
      amount: planRecord.amount,
      email: user.email ?? '',
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
      metadata: { plan, userId: user.id, product: 'jobiest subscription' },
    });
    return Response.json({ reference, data: { authorization_url: result.authorization_url, access_code: result.access_code } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'BILLING_UNAVAILABLE' }, { status: 503 });
  }
}
