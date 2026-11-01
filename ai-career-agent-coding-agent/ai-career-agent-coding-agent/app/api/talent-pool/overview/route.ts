import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { getCandidateTalentPoolOverview, TalentPoolError } from '@/lib/talent-pool/candidate-service';

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-overview:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  try {
    const overview = await getCandidateTalentPoolOverview(user.id, user.email);
    return NextResponse.json(overview);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message, details: err.details }, { status: err.status });
    }
    return NextResponse.json({ error: 'OVERVIEW_LOAD_FAILED' }, { status: 500 });
  }
}
