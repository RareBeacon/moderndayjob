import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { vacancyCreateSchema } from '@/lib/talent-pool/schemas';
import { createEmployerVacancy } from '@/lib/talent-pool/recruiter-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`emp-vacancy:${ip}`, 20, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let parsed;
  try {
    parsed = vacancyCreateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const vacancy = await createEmployerVacancy(user.id, parsed);
    return NextResponse.json({ ok: true, vacancy }, { status: 201 });
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'VACANCY_CREATE_FAILED' }, { status: 500 });
  }
}
