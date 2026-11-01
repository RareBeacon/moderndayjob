import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizePlanCode } from '@/lib/billing/pricing';

/**
 * GET /api/billing/history - returns the signed-in user's own verified payment
 * receipts and current subscription metadata so /billing can display real
 * transaction history and renewal/cancellation status.
 */
export async function GET(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`billing:history:${requestIp(req)}:${user.id}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const [subRes, paymentsRes] = await Promise.all([
    supabaseAdmin
      .from('subscriptions')
      .select('plan, status, source, current_period_start, current_period_end, cancelled_at, provider')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabaseAdmin
      .from('payments')
      .select('id, provider, tx_ref, amount, currency, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const rawSub = subRes.data as {
    plan?: string;
    status?: string;
    source?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
    cancelled_at?: string | null;
    provider?: string | null;
  } | null;

  return Response.json({
    subscription: rawSub
      ? {
          plan: normalizePlanCode(rawSub.plan),
          status: rawSub.status ?? null,
          source: rawSub.source ?? null,
          currentPeriodStart: rawSub.current_period_start ?? null,
          currentPeriodEnd: rawSub.current_period_end ?? null,
          cancelledAt: rawSub.cancelled_at ?? null,
          provider: rawSub.provider ?? null,
        }
      : null,
    payments: (paymentsRes.data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id,
      provider: p.provider,
      reference: p.tx_ref,
      amount: Number(p.amount ?? 0),
      currency: String(p.currency ?? 'NGN'),
      status: p.status,
      createdAt: p.created_at,
    })),
  });
}
