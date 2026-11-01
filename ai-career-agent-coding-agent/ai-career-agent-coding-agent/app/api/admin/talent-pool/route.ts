import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { adminReviewFilterSchema } from '@/lib/talent-pool/schemas';
import { listAdminTalentApplications } from '@/lib/talent-pool/admin-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`admin-tp-list:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let admin;
  try {
    admin = await requireAdminUser(req);
  } catch (err) {
    return adminErrorResponse(err);
  }

  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  let parsed;
  try {
    parsed = adminReviewFilterSchema.parse(rawParams);
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const out = await listAdminTalentApplications(admin.id, parsed);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'ADMIN_LIST_FAILED' }, { status: 500 });
  }
}
