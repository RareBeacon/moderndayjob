import crypto from 'node:crypto';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyPaystackTransaction, planForAmount, paystackWebhookSignature } from '@packages/billing/paystack';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { runDailyPipeline } from '@/lib/agent/pipeline';

/** Paystack events are a few KB; anything larger is not a legitimate webhook
 *  and is rejected up-front (memory-DoS guard). */
const MAX_BODY_BYTES = 64 * 1024;

export const maxDuration = 60;

/** Enqueue a one-user discovery task right after a plan is granted, then
 *  drain the pipeline (same code path as the daily cron) so the agent starts
 *  working within seconds of a paid activation. The queued task is durable:
 *  if this invocation is recycled early, the daily cron still processes it. */
function wakeAgentForPaidUser(userId: string): void {
  after(async () => {
    try {
      await runDailyPipeline();
    } catch {
      /* the daily cron is the durable fallback */
    }
  });
}

/* Paystack webhook → size cap → verify HMAC-SHA512 signature (timing-safe,
   over the RAW body) → replay short-circuit → re-verify the transaction on
   the server by reference → guard the amount/currency/email → invoke the
   idempotent apply_verified_payment DB function with p_provider='paystack'.
   Idempotent end-to-end (payments.tx_ref unique; payment_events dedup). */
export async function POST(req: Request) {
  const rl = await enforceRateLimit(`billing:paystack:webhook:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return new Response('not configured', { status: 503 });

  // 0. Reject oversized payloads before buffering the body.
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) return new Response('too large', { status: 413 });

  // 1. Signature: x-paystack-signature = HMAC-SHA512(raw body, secret key).
  //    Must be computed over the exact bytes Paystack sent, so the body is
  //    read as text here and reused; no re-serialization.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response('too large', { status: 413 });
  const signature = req.headers.get('x-paystack-signature');
  if (!signature) return new Response('invalid', { status: 401 });
  const expected = paystackWebhookSignature(raw, secret);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return new Response('invalid', { status: 401 });
  }

  // 2. Parse payload (bounded by the size caps above).
  let payload: {
    event?: string;
    data?: { id?: number; reference?: string; amount?: number; currency?: string; status?: string };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true, malformed: true });
  }

  // Only successful charges grant a plan.
  if (payload.event !== 'charge.success' || !payload.data) return Response.json({ ok: true, ignored: payload.event });
  const data = payload.data;
  if (!data.reference) return Response.json({ ok: true, noReference: true });

  // 3. Replay short-circuit on our own dedup key (the DB unique constraint
  //    on payments.tx_ref is the final guard; this avoids redundant work).
  const eventId = `paystack:${data.reference}`;
  try {
    const { data: seen } = await supabaseAdmin.from('payment_events').select('event_id').eq('event_id', eventId).maybeSingle();
    if (seen) return Response.json({ ok: true, duplicate: true });
  } catch {
    // fall through to normal processing; final dedup still applies
  }

  // 4. Re-verify the transaction server-side (never trust the payload).
  let verified;
  try {
    verified = await verifyPaystackTransaction(data.reference);
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'VERIFY_ERROR' }, { status: 500 });
  }
  if (verified.status !== 'success') return Response.json({ ok: true, verifyStatus: verified.status });

  // 5. Guard: amount must match a known NGN plan (kobo -> naira), with a
  //    reachable email.
  const amountNGN = verified.amount / 100;
  const plan = planForAmount(amountNGN);
  if (!plan || verified.currency !== 'NGN' || !verified.email) {
    return Response.json({ ok: false, unexpectedAmount: amountNGN, currency: verified.currency }, { status: 202 });
  }

  // 6. Apply upgrade via the idempotent DB function, then record the event.
  try {
    const { error } = await supabaseAdmin.rpc('apply_verified_payment', {
      p_transaction_id: verified.reference,
      p_tx_ref: verified.reference,
      p_amount: amountNGN,
      p_currency: 'NGN',
      p_email: verified.email,
      p_provider: 'paystack',
    });
    if (error) throw error;

    await supabaseAdmin
      .from('payment_events')
      .upsert(
        { event_id: eventId, event_type: String(payload.event ?? 'charge.success'), event_payload: payload as unknown as object },
        { onConflict: 'event_id', ignoreDuplicates: true },
      );

    // The user just activated a paid plan: their agent should go to work now.
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('email', verified.email)
        .limit(1)
        .maybeSingle();
      const userId = (profile as { user_id?: string } | null)?.user_id;
      if (userId) {
        const { data: existing } = await supabaseAdmin
          .from('agent_tasks')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'JOB_DISCOVERY')
          .in('status', ['QUEUED', 'RUNNING'])
          .maybeSingle();
        if (!existing) {
          await supabaseAdmin.from('agent_tasks').insert({
            user_id: userId,
            type: 'JOB_DISCOVERY',
            status: 'QUEUED',
            payload: { scope: 'paid_activation', plan, provider: 'paystack' },
          });
        }
        wakeAgentForPaidUser(userId);
      }
    } catch {
      /* the daily cron still discovers for every eligible paid user */
    }
    return Response.json({ ok: true, plan });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'APPLY_ERROR' }, { status: 500 });
  }
}
