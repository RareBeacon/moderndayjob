import { NextResponse } from 'next/server';
import { z, type ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { shortlistAddCandidateSchema } from '@/lib/talent-pool/schemas';
import { addCandidateToShortlist } from '@/lib/talent-pool/recruiter-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

const idSchema = z.guid();

export async function POST(req: Request, ctx: { params: Promise<{ shortlistId: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`emp-sl-add:${ip}`, 30, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { shortlistId } = await ctx.params;
  if (!idSchema.safeParse(shortlistId).success) {
    return NextResponse.json({ error: 'INVALID_SHORTLIST_ID' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = shortlistAddCandidateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const out = await addCandidateToShortlist(user.id, shortlistId, parsed);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'SHORTLIST_ADD_FAILED' }, { status: 500 });
  }
}
