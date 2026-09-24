import { supabaseAdmin } from '@/lib/supabase';
import { candidateSlug } from './portfolios.shared';

/**
 * Server-side portfolio functions (Supabase reads/writes). Pure domain logic
 * lives in lib/portfolios.shared.ts (client-safe); this module re-exports it
 * so existing server consumers keep their import paths.
 */

export * from './portfolios.shared';

export async function slugAvailable(slug: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('portfolios')
    .select('id')
    .or(`slug.eq.${slug},previous_slug.eq.${slug}`)
    .limit(1)
    .maybeSingle();
  return !data;
}

/** A slug that is free under both the current and previous columns. */
export async function uniqueSlug(title: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = candidateSlug(title);
    if (await slugAvailable(candidate)) return candidate;
  }
  // Practically unreachable (36^6 space); still deterministic rather than
  // throwing: full random base.
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The user's plan portfolio limit (record count, D1: 1/5/10/26). Paid plan
 *  from a live subscription period, else FREE. */
export async function portfolioLimitFor(userId: string): Promise<number> {
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  const live = sub && sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();
  const planCode = (live ? (sub as { plan?: string }).plan : 'FREE') ?? 'FREE';
  const { data: plan } = await supabaseAdmin
    .from('subscription_plans')
    .select('portfolio_limit')
    .eq('code', planCode)
    .maybeSingle();
  return (plan as { portfolio_limit?: number } | null)?.portfolio_limit ?? 1;
}
