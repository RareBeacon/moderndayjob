import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyFlutterwaveTransaction, planForAmount } from '@packages/billing/flutterwave';

/** Flutterwave events are a few KB; anything larger is not a legitimate
 *  webhook and is rejected up-front (memory-DoS guard). */
const MAX_BODY_BYTES = 64 * 1024;

/* Flutterwave webhook → size cap → verify signature → replay short-circuit →
   re-verify the transaction on the server → guard the amount → invoke the
   idempotent apply_verified_payment DB function. Idempotent end-to-end
   (payments.tx_ref unique; subscription upsert; payment_events.event_id dedup). */
export async function POST(req: Request) {
  // 0. Reject oversized payloads before buffering the body.
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) return new Response('too large', { status: 413 });

  // 1. Verify webhook signature (verif-hash == FLW_SECRET_HASH, timing-safe)
  const signature = req.headers.get('verif-hash');
  const secret = process.env.FLW_SECRET_HASH;
  if (!signature || !secret) return new Response('invalid', { status: 401 });
  const sigBuf = Buffer.from(signature);
  const secBuf = Buffer.from(secret);
  if (sigBuf.length !== secBuf.length || !crypto.timingSafeEqual(sigBuf, secBuf)) {
    return new Response('invalid', { status: 401 });
  }

  // 2. Parse payload (bounded — the size cap above plus this belt-and-braces
  //    check guards against chunked/absent content-length).
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response('too large', { status: 413 });
  let payload: {
    event?: string;
    event_id?: string;
    data?: { id?: number; tx_ref?: string; status?: string };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true, malformed: true });
  }

  const eventType = payload.event;
  const data = payload.data;

  // Only successful charge completions grant a plan
  if (eventType !== 'charge.completed' || !data) return Response.json({ ok: true, ignored: eventType });
  if (data.status !== 'successful') return Response.json({ ok: true, status: data.status });
  if (!data.id) return Response.json({ ok: true, noId: true });

  // 3. Replay short-circuit: if this exact event_id was already recorded, stop
  //    before any external re-verification or DB grant. Best-effort — the DB
  //    (payment_events.event_id unique) is the final guard, so a race here is
  //    still safe via the idempotent apply_verified_payment RPC.
  if (payload.event_id) {
    try {
      const { data: seen } = await supabaseAdmin
        .from('payment_events')
        .select('event_id')
        .eq('event_id', payload.event_id)
        .maybeSingle();
      if (seen) return Response.json({ ok: true, duplicate: true });
    } catch {
      // fall through to normal processing; final dedup still applies
    }
  }

  // 4. Re-verify the transaction server-side (never trust the payload)
  let verified;
  try {
    verified = await verifyFlutterwaveTransaction(data.id);
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'VERIFY_ERROR' }, { status: 500 });
  }
  if (verified.status !== 'successful') return Response.json({ ok: true, verifyStatus: verified.status });

  // 5. Guard: amount must match a known NGN plan, with a reachable email
  const amount = Number(verified.amount);
  const plan = planForAmount(amount);
  if (!plan || verified.currency !== 'NGN' || !verified.customer?.email) {
    return Response.json({ ok: false, unexpectedAmount: amount, currency: verified.currency }, { status: 202 });
  }

  // 6. Apply upgrade via the idempotent DB function, then record the event
  try {
    const { error } = await supabaseAdmin.rpc('apply_verified_payment', {
      p_transaction_id: String(verified.id),
      p_tx_ref: verified.tx_ref,
      p_amount: amount,
      p_currency: verified.currency,
      p_email: verified.customer.email,
    });
    if (error) throw error;

    if (payload.event_id) {
      await supabaseAdmin
        .from('payment_events')
        .upsert(
          { event_id: payload.event_id, event_type: eventType, event_payload: payload as unknown as object },
          { onConflict: 'event_id', ignoreDuplicates: true },
        );
    }
    return Response.json({ ok: true, plan });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'APPLY_ERROR' }, { status: 500 });
  }
}
