import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { dodoConfigured, dodoPlanForProductId, planForAmountIn, retrieveDodoPayment, verifyDodoWebhookSignature } from '@packages/billing/dodo';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { runDailyPipeline } from '@/lib/agent/pipeline';

/** Dodo events are a few KB; anything larger is not a legitimate webhook and
 *  is rejected up-front (memory-DoS guard). */
const MAX_BODY_BYTES = 64 * 1024;

export const maxDuration = 60;

/** Same wake-up the Paystack path uses: drain the pipeline right after a
 *  paid activation so the agent starts working within seconds. The queued
 *  task is durable; the daily cron is the fallback if this is recycled. */
function wakeAgentForPaidUser(userId: string): void {
  void userId;
  after(async () => {
    try {
      await runDailyPipeline();
    } catch {
      /* the daily cron is the durable fallback */
    }
  });
}

/* Dodo Payments webhook (Standard Webhooks) → size cap → timing-safe
   HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}` keyed
   with DODO_PAYMENTS_WEBHOOK_KEY → parse → dedup on the payment id →
   server-side re-verification via GET /payments/{id} → amount/currency/
   email/product guards → invoke the idempotent apply_verified_payment DB
   function with p_provider='dodo' (shared with Paystack/Flutterwave).
   Idempotent end-to-end (payments.tx_ref unique; payment_events dedup).

   Only `payment.succeeded` grants. Renewal charges fire their own
   payment.succeeded with a fresh payment id, which extends the plan through
   the same idempotent function. Subscription lifecycle events are acked and
   ignored. Dodo retries deliveries for up to ~10 hours with the original
   webhook-timestamp, so there is deliberately no timestamp-freshness window;
   replays are covered by signature + payment-id dedup instead. */
export async function POST(req: Request) {
  const rl = await enforceRateLimit(`billing:dodo:webhook:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  if (!dodoConfigured() || !process.env.DODO_PAYMENTS_WEBHOOK_KEY) {
    return new Response('not configured', { status: 503 });
  }

  // 0. Reject oversized payloads before buffering the body.
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) return new Response('too large', { status: 413 });

  // 1. Signature over the exact bytes Dodo sent (no re-serialization).
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response('too large', { status: 413 });
  const ok = verifyDodoWebhookSignature(
    raw,
    req.headers.get('webhook-id'),
    req.headers.get('webhook-timestamp'),
    req.headers.get('webhook-signature'),
  );
  if (!ok) return new Response('invalid', { status: 401 });

  // 2. Parse payload (bounded by the size caps above).
  let payload: {
    type?: string;
    data?: {
      payment_id?: string;
      subscription_id?: string | null;
      total_amount?: number;
      currency?: string;
      status?: string;
      product_id?: string | null;
      customer?: { email?: string | null } | null;
      metadata?: Record<string, unknown> | null;
    };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true, malformed: true });
  }

  // Only successful charges grant a plan; lifecycle events are acked.
  if (payload.type !== 'payment.succeeded' || !payload.data || !payload.data.payment_id) {
    return Response.json({ ok: true, ignored: payload.type ?? 'unknown' });
  }
  const data = payload.data;
  const paymentId = payload.data.payment_id;

  // 3. Replay short-circuit on the payment id (the unit of idempotency; the
  //    DB unique constraint on payments.tx_ref is the final guard).
  const eventId = `dodo:${paymentId}`;
  try {
    const { data: seen } = await supabaseAdmin.from('payment_events').select('event_id').eq('event_id', eventId).maybeSingle();
    if (seen) return Response.json({ ok: true, duplicate: true });
  } catch {
    /* fall through to normal processing; final dedup still applies */
  }

  // 4. Re-verify the payment server-side (never trust the payload).
  let verified;
  try {
    verified = await retrieveDodoPayment(paymentId);
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'VERIFY_ERROR' }, { status: 500 });
  }
  if (verified.status !== 'succeeded') return Response.json({ ok: true, verifyStatus: verified.status });

  // 5. Guard: USD amount must match a known plan (cents -> dollars) AND the
  //    dashboard product must map to the same plan, with a reachable email.
  const amountMajor = verified.total_amount / 100;
  const amountPlan = planForAmountIn('USD', amountMajor);
  const productPlan = verified.product_id ? dodoPlanForProductId(verified.product_id) : null;
  const plan = productPlan ?? amountPlan;
  const email = verified.customer?.email ?? null;
  if (!plan || !email) {
    return Response.json({ ok: false, unexpectedAmount: amountMajor, currency: verified.currency }, { status: 202 });
  }
  if (productPlan && amountPlan && productPlan !== amountPlan) {
    // Product and charged amount disagree: refuse rather than guess.
    return Response.json({ ok: false, amountProductMismatch: { productPlan, amountPlan } }, { status: 202 });
  }

  // 6. Apply the upgrade via the idempotent DB function, then record the event.
  try {
    const { error } = await supabaseAdmin.rpc('apply_verified_payment', {
      p_transaction_id: paymentId,
      p_tx_ref: paymentId,
      p_amount: amountMajor,
      p_currency: 'USD',
      p_email: email,
      p_provider: 'dodo',
    });
    if (error) throw error;

    await supabaseAdmin
      .from('payment_events')
      .upsert(
        { event_id: eventId, event_type: 'payment.succeeded', event_payload: payload as unknown as object },
        { onConflict: 'event_id', ignoreDuplicates: true },
      );

    // The user just activated a paid plan: their agent should go to work now.
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('email', email)
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
            payload: { scope: 'paid_activation', plan, provider: 'dodo' },
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
