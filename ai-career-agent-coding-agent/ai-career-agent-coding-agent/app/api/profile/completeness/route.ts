import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getProfileCompleteness } from '@/lib/profile-completeness';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const rl = await enforceRateLimit(`profile:completeness:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const u = await requireUser({ req: req }).catch(() => null);
  if (!u) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  return NextResponse.json(await getProfileCompleteness(u.id));
}
