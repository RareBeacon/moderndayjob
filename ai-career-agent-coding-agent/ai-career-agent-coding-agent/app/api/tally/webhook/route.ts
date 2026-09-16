import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Tally form webhook. Fail closed:
 *  - without TALLY_WEBHOOK_SECRET configured, nothing is accepted (a missing
 *    secret must never mean unsigned events are trusted);
 *  - bodies are size-capped before buffering (memory guard);
 *  - the HMAC signature is compared timing-safely;
 *  - malformed JSON and storage failures return controlled responses.
 */
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(req: Request) {
  const secret = process.env.TALLY_WEBHOOK_SECRET;
  if (!secret) return new Response('not configured', { status: 503 });

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) return new Response('too large', { status: 413 });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response('too large', { status: 413 });

  const signature = req.headers.get('tally-signature') ?? '';
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return new Response('invalid', { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true, malformed: true });
  }

  const { error } = await supabaseAdmin
    .from('security_events')
    .insert({ event_type: 'TALLY_EVENT', severity: 'INFO', metadata: event as object });
  if (error) return new Response('storage error', { status: 500 });

  return Response.json({ ok: true });
}
