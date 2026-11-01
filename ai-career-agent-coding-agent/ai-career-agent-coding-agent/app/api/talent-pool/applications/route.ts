import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { hashIp } from '@/lib/ai/usage';
import { talentApplicationSubmitSchema } from '@/lib/talent-pool/schemas';
import { submitTalentApplication, TalentPoolError } from '@/lib/talent-pool/candidate-service';

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-submit:${ip}`, 10, '10 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let parsed;
  try {
    parsed = talentApplicationSubmitSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const ua = req.headers.get('user-agent') ?? '';
    const result = await submitTalentApplication(user.id, user.email, parsed, {
      ipHash: hashIp(ip),
      uaHash: ua ? hashIp(ua.slice(0, 200)) : null,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message, details: err.details }, { status: err.status });
    }
    return NextResponse.json({ error: 'APPLICATION_SUBMIT_FAILED' }, { status: 500 });
  }
}
