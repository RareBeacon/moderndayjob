import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { uploadInterviewRecordingSegment } from '@/lib/talent-pool/interview-engine';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

const idSchema = z.guid();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-int-rec:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('segment');
    const segmentIndex = Number(formData.get('segment_index') ?? 0);
    const questionIdRaw = formData.get('question_id');
    const durationMsRaw = formData.get('duration_ms');

    if (!(file instanceof Blob) || !Number.isInteger(segmentIndex) || segmentIndex < 0) {
      return NextResponse.json({ error: 'INVALID_RECORDING_PAYLOAD' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const out = await uploadInterviewRecordingSegment({
      userId: user.id,
      sessionId: id,
      segmentIndex,
      questionId: typeof questionIdRaw === 'string' && idSchema.safeParse(questionIdRaw).success ? questionIdRaw : null,
      mimeType: file.type || 'video/webm',
      durationMs: durationMsRaw ? Number(durationMsRaw) : null,
      bytes,
    });

    return NextResponse.json({ ok: true, recording: out }, { status: 201 });
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'RECORDING_UPLOAD_FAILED' }, { status: 500 });
  }
}
