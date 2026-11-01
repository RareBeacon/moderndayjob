import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { recruiterSearchFilterSchema } from '@/lib/talent-pool/schemas';
import { searchApprovedTalentCandidates } from '@/lib/talent-pool/recruiter-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`emp-search:${ip}`, 40, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());

  let parsed;
  try {
    parsed = recruiterSearchFilterSchema.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const results = await searchApprovedTalentCandidates(user.id, parsed);
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'CANDIDATE_SEARCH_FAILED' }, { status: 500 });
  }
}
