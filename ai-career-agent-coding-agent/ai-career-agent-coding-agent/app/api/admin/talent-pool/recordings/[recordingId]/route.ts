import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { issueAdminRecordingSignedUrl } from '@/lib/talent-pool/admin-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

const idSchema = z.guid();

export async function GET(req: Request, ctx: { params: Promise<{ recordingId: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`admin-tp-rec:${ip}`, 40, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let admin;
  try {
    admin = await requireAdminUser(req);
  } catch (err) {
    return adminErrorResponse(err);
  }

  const { recordingId } = await ctx.params;
  if (!idSchema.safeParse(recordingId).success) {
    return NextResponse.json({ error: 'INVALID_RECORDING_ID' }, { status: 400 });
  }

  try {
    const out = await issueAdminRecordingSignedUrl(admin.id, recordingId);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'RECORDING_ACCESS_FAILED' }, { status: 500 });
  }
}
