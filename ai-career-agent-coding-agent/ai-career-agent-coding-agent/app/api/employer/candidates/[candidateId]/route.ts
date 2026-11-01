import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { getAuthorizedCandidateDetailForEmployer } from '@/lib/talent-pool/recruiter-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

const idSchema = z.guid();

export async function GET(req: Request, ctx: { params: Promise<{ candidateId: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`emp-cand-detail:${ip}`, 30, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { candidateId } = await ctx.params;
  if (!idSchema.safeParse(candidateId).success) {
    return NextResponse.json({ error: 'INVALID_CANDIDATE_ID' }, { status: 400 });
  }

  try {
    const detail = await getAuthorizedCandidateDetailForEmployer(user.id, candidateId);
    return NextResponse.json({ candidate: detail });
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'CANDIDATE_LOAD_FAILED' }, { status: 500 });
  }
}
