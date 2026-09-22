import { PLANS, PLAN_ORDER } from '@/lib/billing/pricing';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * GET /api/plans - the public plan cards, straight from the same PLANS
 * object the pricing page renders. Exists so the mobile app (and any future
 * client) shows one source of truth: prices and features can never drift
 * between the website and the app. Public and cacheable, still rate-limited
 * per the 1000-user capacity mandate.
 */
export async function GET(req: Request) {
  const rl = await enforceRateLimit(`plans:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  return Response.json(
    { plans: PLAN_ORDER.map((code) => PLANS[code]) },
    { headers: { 'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=600' } },
  );
}
