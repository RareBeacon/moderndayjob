import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { creditAvailable } from '@/lib/credits';

/**
 * GET /api/auto-apply/activation: the activation status page's data source.
 * Returns the account's activation state (never card data beyond last4 and
 * bank name) plus the current spendable AUTO_APPLY credit balance from the
 * ledger (owner decision D1: 0 before activation, 5 per month after).
 */
export async function GET(req: Request) {
  const rl = await enforceRateLimit(`auto-apply:activation:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data: activation } = await supabaseAdmin
    .from('auto_apply_activations')
    .select('status, card_last4, card_brand, bank, activated_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  let autoApplyCredits = 0;
  try {
    autoApplyCredits = await creditAvailable(user.id, 'AUTO_APPLY');
  } catch {
    autoApplyCredits = 0;
  }

  return Response.json({
    activation: (activation as Record<string, unknown> | null) ?? null,
    autoApplyCredits,
  });
}
