import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { paystackConfigured, planForAmountIn, verifyPaystackTransaction } from '@packages/billing/paystack';
import { z } from 'zod';

const body = z.object({ reference: z.string().trim().min(8).max(120) });

/**
 * POST /api/billing/paystack/verify - reconciliation for missed webhooks.
 * The user asks "did my payment land?" with their reference. The reference is
 * only used to LOCATE the transaction (and must be owner-prefixed); the grant
 * decision is made entirely server-side: re-verify with Paystack by
 * reference, guard amount/currency against subscription_plans, then apply
 * the same idempotent apply_verified_payment RPC the webhook uses. Safe to
 * call repeatedly; never grants from the redirect alone.
 */
export async function POST(req: Request) {
  if (!paystackConfigured()) return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rate = await enforceRateLimit(`payment-verify:${requestIp(req)}:${user.id}`, 10, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  const reference = parsed.data.reference;

  // Ownership: references are created as `pstk_<user.id>_<timestamp>` by /create.
  if (!reference.startsWith(`pstk_${user.id}_`)) {
    return Response.json({ error: 'NOT_YOUR_TRANSACTION' }, { status: 403 });
  }

  try {
    const verified = await verifyPaystackTransaction(reference);
    if (verified.status !== 'success') {
      return Response.json({ status: verified.status }, { status: 200 });
    }

    const amountMajor = verified.amount / 100; // kobo -> naira, or cents -> USD
    const plan = planForAmountIn(verified.currency, amountMajor);
    if (!plan || !verified.email) {
      return Response.json({ status: 'ignored', reason: 'AMOUNT_CURRENCY_OR_EMAIL_MISMATCH' }, { status: 200 });
    }

    const { error } = await supabaseAdmin.rpc('apply_verified_payment', {
      p_transaction_id: verified.reference,
      p_tx_ref: verified.reference,
      p_amount: amountMajor,
      p_currency: verified.currency,
      p_email: verified.email,
      p_provider: 'paystack',
    });
    if (error) throw error;
    return Response.json({ status: 'successful', plan });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'VERIFY_ERROR';
    return Response.json({ error: 'VERIFY_ERROR', detail: detail.slice(0, 200) }, { status: 500 });
  }
}
