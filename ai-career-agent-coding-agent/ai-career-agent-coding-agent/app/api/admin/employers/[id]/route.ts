import { NextResponse } from 'next/server';
import { z, type ZodError } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { adminEmployerDecisionSchema } from '@/lib/talent-pool/schemas';
import { decideEmployerVerification } from '@/lib/talent-pool/admin-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

const idSchema = z.guid();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`admin-emp-decide:${ip}`, 30, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let admin;
  try {
    admin = await requireAdminUser(req);
  } catch (err) {
    return adminErrorResponse(err);
  }

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'INVALID_ORGANIZATION_ID' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = adminEmployerDecisionSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const out = await decideEmployerVerification(admin.id, id, parsed);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'EMPLOYER_DECISION_FAILED' }, { status: 500 });
  }
}
