import { requireUser } from '../../../lib/auth';
import { getEntitlement } from '@packages/security/entitlements';
import { ensurePeriodGrants, ledgerEnabled } from '../../../lib/credits';
import { enforceRateLimit, requestIp } from '../../../lib/rate-limit';

export async function GET(req: Request) {
  const rl = await enforceRateLimit(`entitlements:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const u = await requireUser({ req }).catch(() => null);
  if (!u) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  try {
    if (ledgerEnabled()) {
      await ensurePeriodGrants(u.id).catch(() => {});
    }
    return Response.json(await getEntitlement(u.id));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'ENTITLEMENT_LOOKUP_FAILED';
    if (msg.startsWith('ACCOUNT_')) {
      return Response.json({ error: msg }, { status: 403 });
    }
    return Response.json({ error: 'ENTITLEMENT_LOOKUP_FAILED' }, { status: 500 });
  }
}
