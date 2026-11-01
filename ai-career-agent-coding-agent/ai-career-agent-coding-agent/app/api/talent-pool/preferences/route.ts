import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { talentVisibilitySettingsSchema } from '@/lib/talent-pool/schemas';
import { updateCandidatePreferences, TalentPoolError } from '@/lib/talent-pool/candidate-service';

export async function PATCH(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-prefs:${ip}`, 30, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let parsed;
  try {
    parsed = talentVisibilitySettingsSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    await updateCandidatePreferences(user.id, parsed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'PREFERENCES_UPDATE_FAILED' }, { status: 500 });
  }
}
