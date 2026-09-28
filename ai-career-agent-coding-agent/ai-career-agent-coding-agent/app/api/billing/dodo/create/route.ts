import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { createDodoCheckout, dodoConfigured, dodoProductIdForPlan } from '@packages/billing/dodo';
import { z } from 'zod';

const body = z.object({ plan: z.enum(['BASIC', 'PREMIUM', 'MAX']) });

/** POST /api/billing/dodo/create; start a Dodo Payments hosted checkout
 *  (Merchant of Record: Dodo handles global VAT/sales tax) for a paid plan.
 *  The plan is validated server-side and the Dodo product id comes from env
 *  (DODO_PRODUCT_<PLAN>), never the client. Dodo checkouts are always USD.
 *  The grant itself is applied by the signed webhook, never by the redirect
 *  back to /billing/success. */
export async function POST(req: Request) {
  if (!dodoConfigured()) {
    return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
  }
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  // Same budget as the other providers: 5 payment starts per hour per user,
  // shared across providers.
  const rate = await enforceRateLimit(`payment:${requestIp(req)}:${user.id}`, 5, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  const { plan } = parsed.data;

  const { data: planRecord } = await supabaseAdmin.from('subscription_plans').select('*').eq('code', plan).maybeSingle();
  if (!planRecord) return Response.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });

  const productId = dodoProductIdForPlan(plan);
  if (!productId) return Response.json({ error: 'PLAN_NOT_CONFIGURED' }, { status: 503 });

  try {
    const session = await createDodoCheckout({
      productId,
      email: user.email ?? '',
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
      metadata: { plan, userId: user.id, product: 'jobiest subscription', currency: 'USD' },
    });
    return Response.json({ session_id: session.session_id, currency: 'USD', data: { checkout_url: session.checkout_url } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'BILLING_UNAVAILABLE' }, { status: 503 });
  }
}
