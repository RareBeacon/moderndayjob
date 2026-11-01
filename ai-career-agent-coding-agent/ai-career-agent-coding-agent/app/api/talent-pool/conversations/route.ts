import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { listConversationsForParticipant } from '@/lib/talent-pool/recruiter-service';

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-conv-list:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  try {
    const out = await listConversationsForParticipant(user.id);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: 'CONVERSATIONS_LOAD_FAILED' }, { status: 500 });
  }
}
