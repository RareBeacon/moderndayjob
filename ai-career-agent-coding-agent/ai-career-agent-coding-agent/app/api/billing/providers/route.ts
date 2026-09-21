import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { flutterwaveConfigured } from '@packages/billing/flutterwave';
import { paystackConfigured } from '@packages/billing/paystack';

/** GET /api/billing/providers - which payment providers are configured.
 *  Returns booleans only (no secrets); lets the billing page render only the
 *  checkout options that can actually complete. Public and cacheable, but
 *  still rate-limited per the 1000-user capacity mandate. */
export async function GET(req: Request) {
  const rl = await enforceRateLimit(`billing:providers:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  return Response.json(
    { flutterwave: flutterwaveConfigured(), paystack: paystackConfigured() },
    { headers: { 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } },
  );
}
