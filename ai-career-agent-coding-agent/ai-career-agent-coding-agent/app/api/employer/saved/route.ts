import { NextResponse } from 'next/server';
import { z, type ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { saveCandidateSchema } from '@/lib/talent-pool/schemas';
import {
  removeSavedCandidateForEmployer,
  saveCandidateForEmployer,
} from '@/lib/talent-pool/recruiter-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

const idSchema = z.guid();

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`emp-save:${ip}`, 40, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let parsed;
  try {
    parsed = saveCandidateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const out = await saveCandidateForEmployer(user.id, parsed);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'SAVE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`emp-unsave:${ip}`, 40, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const candidateId = new URL(req.url).searchParams.get('candidate_user_id') ?? '';
  if (!idSchema.safeParse(candidateId).success) {
    return NextResponse.json({ error: 'INVALID_CANDIDATE_ID' }, { status: 400 });
  }

  try {
    const out = await removeSavedCandidateForEmployer(user.id, candidateId);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'UNSAVE_FAILED' }, { status: 500 });
  }
}
