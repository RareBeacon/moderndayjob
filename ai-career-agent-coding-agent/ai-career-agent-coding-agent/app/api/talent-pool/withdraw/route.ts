import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { hashIp } from '@/lib/ai/usage';
import { talentWithdrawSchema } from '@/lib/talent-pool/schemas';
import { withdrawTalentApplication, TalentPoolError } from '@/lib/talent-pool/candidate-service';

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-withdraw:${ip}`, 10, '10 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let parsed;
  try {
    const raw = await req.json().catch(() => ({}));
    parsed = talentWithdrawSchema.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const ua = req.headers.get('user-agent') ?? '';
    await withdrawTalentApplication(user.id, user.email, parsed, {
      ipHash: hashIp(ip),
      uaHash: ua ? hashIp(ua.slice(0, 200)) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'WITHDRAW_FAILED' }, { status: 500 });
  }
}
