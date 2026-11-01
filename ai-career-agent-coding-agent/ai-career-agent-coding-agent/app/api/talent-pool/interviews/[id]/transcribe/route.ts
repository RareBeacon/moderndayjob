import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { transcribeAudioChunk } from '@/lib/talent-pool/interview-engine';

const idSchema = z.guid();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-int-stt:${ip}`, 45, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const audio = formData.get('audio');
    if (!(audio instanceof Blob) || audio.size === 0 || audio.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'INVALID_AUDIO_PAYLOAD' }, { status: 400 });
    }
    const bytes = Buffer.from(await audio.arrayBuffer());
    const result = await transcribeAudioChunk(bytes);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ supported: false, transcript: '', confidence: 0, provider: 'browser-speech-api' });
  }
}
