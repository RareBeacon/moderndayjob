import { countryFromHeader } from '@/lib/billing/currency';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * GET /api/geo - the visitor's country, from the edge (Vercel geo header).
 * Used by client components (homepage pricing cards, billing page) to pick
 * the display currency. Server routes read the same header directly and
 * decide the CHARGE currency from it, so display and charge always agree.
 * No identity, no coordinates: country only. Public by design (the anon
 * equivalent, x-vercel-ip-country, is on every request anyway) and
 * rate-limited like every other route.
 */
export async function GET(req: Request) {
  const rl = await enforceRateLimit(`geo:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  return Response.json(
    { country: countryFromHeader(req.headers.get('x-vercel-ip-country')) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
