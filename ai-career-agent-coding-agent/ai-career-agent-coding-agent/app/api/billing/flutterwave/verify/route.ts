import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import {
  findFlutterwaveTransactionByRef,
  verifyFlutterwaveTransaction,
  planForAmount,
  flutterwaveConfigured,
} from '@packages/billing/flutterwave';
import { z } from 'zod';

const body = z.object({ tx_ref: z.string().trim().min(8).max(120) });

/**
 * POST /api/billing/flutterwave/verify - reconciliation for missed webhooks.
 * The user asks "did my payment land?" with their tx_ref. The tx_ref is only
 * used to LOCATE the transaction (and must be owner-prefixed); the grant
 * decision is made entirely server-side: re-verify with Flutterwave by id,
 * guard amount/currency against subscription_plans, then apply the same
 * idempotent apply_verified_payment RPC the webhook uses. Safe to call
 * repeatedly; never grants from the redirect alone.
 */
export async function POST(req: Request) {
  if (!flutterwaveConfigured()) return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rate = await enforceRateLimit(`payment-verify:${requestIp(req)}:${user.id}`, 10, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  const txRef = parsed.data.tx_ref;

  // Ownership: tx_refs are created as `aca_<user.id>_<timestamp>` by /create.
  if (!txRef.startsWith(`aca_${user.id}_`)) {
    return Response.json({ error: 'NOT_YOUR_TRANSACTION' }, { status: 403 });
  }

  try {
    const found = await findFlutterwaveTransactionByRef(txRef);
    if (!found) return Response.json({ status: 'not_found' }, { status: 200 });

    // Re-verify server-side; never trust the lookup result alone.
    const verified = await verifyFlutterwaveTransaction(found.id);
    if (verified.status !== 'successful') {
      return Response.json({ status: verified.status }, { status: 200 });
    }

    const amount = Number(verified.amount);
    const plan = planForAmount(amount);
    if (!plan || verified.currency !== 'NGN' || !verified.customer?.email) {
      return Response.json({ status: 'successful', plan: null, unexpectedAmount: amount }, { status: 200 });
    }

    const { error } = await supabaseAdmin.rpc('apply_verified_payment', {
      p_transaction_id: String(verified.id),
      p_tx_ref: verified.tx_ref,
      p_amount: amount,
      p_currency: verified.currency,
      p_email: verified.customer.email,
    });
    if (error) throw error;
    return Response.json({ status: 'successful', plan });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'VERIFY_ERROR' },
      { status: 502 },
    );
  }
}
