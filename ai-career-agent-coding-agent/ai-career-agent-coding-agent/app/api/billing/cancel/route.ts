import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent } from '@/lib/audit';

/**
 * POST /api/billing/cancel - user-initiated subscription cancellation at period
 * end. Marks cancelled_at = now() while preserving paid entitlements until
 * current_period_end expires (Terms of Service Section 4).
 */
export async function POST(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`billing:cancel:${requestIp(req)}:${user.id}`, 10, '10 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status, current_period_start, current_period_end, cancelled_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sub || sub.plan === 'FREE' || !String(sub.status ?? '').startsWith('ACTIVE')) {
    return Response.json({ error: 'NO_ACTIVE_PAID_SUBSCRIPTION' }, { status: 400 });
  }

  if (sub.cancelled_at) {
    return Response.json({ ok: true, alreadyCancelled: true, activeUntil: sub.current_period_end });
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({ cancelled_at: nowIso, updated_at: nowIso })
    .eq('user_id', user.id);
  if (error) {
    return Response.json({ error: 'CANCEL_FAILED' }, { status: 500 });
  }

  try {
    await supabaseAdmin.from('subscription_history').insert({
      user_id: user.id,
      old_plan: sub.plan,
      new_plan: sub.plan,
      old_status: sub.status,
      new_status: sub.status,
      source: 'USER_CANCEL_AT_PERIOD_END',
      actor_id: user.id,
      reason: 'User scheduled cancellation at end of current billing period',
      period_start: sub.current_period_start,
      period_end: sub.current_period_end,
    });
  } catch {
    /* history append is best-effort */
  }

  void auditEvent({
    action: 'SUBSCRIPTION_CANCEL_SCHEDULED',
    resource: 'subscriptions',
    resourceId: user.id,
    userId: user.id,
    outcome: 'allow',
    meta: { plan: sub.plan, activeUntil: sub.current_period_end },
  });

  return Response.json({ ok: true, activeUntil: sub.current_period_end });
}
