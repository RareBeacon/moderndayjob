import { supabaseAdmin } from '@/lib/supabase';

/**
 * Free-tier abuse ladder (Master Implementation Package §106/§236-237, B-073).
 *
 * Design constraints (all from the package):
 *  - multi-signal, never single-signal gating;
 *  - reversible and appealable - every escalation is logged with its reason,
 *    budgets reset daily and are env-tunable without a deploy of code changes
 *    beyond the env var itself;
 *  - privacy-reviewed - signals use the HMAC'd ip_hash and email metadata,
 *    never raw IPs; no device fingerprinting at this stage.
 *
 * The ladder itself, in escalation order:
 *  1. baseline: per-minute/per-hour rate limits (lib/rate-limit, existing);
 *  2. soft: per-IP daily generation budget (default 60) → 429 + logged;
 *  3. hard: global anonymous daily budget (default 2000) → 429 + logged;
 *  4. manual: admin review via /admin/security (security_events feed),
 *     suspend/terminate (existing admin actions).
 * Appeal: the 429 message points at support; /help documents the contact.
 */

/** Common disposable/inbox domains (curated; extend freely). */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'temp-mail.org',
  'yopmail.com', 'throwawaymail.com', 'sharklasers.com', 'grr.la',
  'maildrop.cc', 'dispostable.com', 'trashmail.com', 'getnada.com',
  'mohmal.com', 'emailondeck.com', 'tempmail.net', 'tempmailo.com',
  'fakeinbox.com', 'mailnesia.com', 'mytemp.email', 'spambog.com',
  'mailcatch.com', 'inboxbear.com', 'tempr.email', 'discard.email',
  'spam4.me', 'mailtemp.info', 'burnermail.io', '33mail.com',
]);

export function emailDomainOf(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_DOMAINS.has(emailDomainOf(email));
}

/**
 * Heuristic: does the local part look machine-generated (account farming)?
 * Conservative - false positives are only a signal, never a block.
 */
export function looksMachineGenerated(email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length < 8) return false;
  const digits = (local.match(/\d/g) ?? []).length;
  const vowelRuns = local.replace(/[^aeiou]/g, '');
  // ≥6 digits in a ≥12-char local part (e.g. live.check.1789545718 stays fine:
  // it has separators and words; raw digit-soup does not)
  if (local.length >= 12 && digits >= 8) return true;
  // long run with almost no vowels (random consonant soup)
  if (local.length >= 10 && vowelRuns.length <= 1) return true;
  return false;
}

export interface SignupRisk {
  level: 'low' | 'elevated' | 'high';
  score: number;
  signals: string[];
}

/**
 * Score signup risk from multiple signals. `ipSignups24h` is the count of
 * USER_SIGNUP audit rows with the same ip_hash in the last 24h (caller
 * queries audit_logs; see signup route). NOTE: an elevated/high level never
 * blocks signup (instant-access is a product decision) - it feeds the
 * security digest and admin review.
 */
export function signupRisk(email: string, ipSignups24h: number): SignupRisk {
  const signals: string[] = [];
  let score = 0;
  if (isDisposableEmail(email)) {
    score += 3;
    signals.push('disposable_domain');
  }
  if (looksMachineGenerated(email)) {
    score += 2;
    signals.push('machine_generated_localpart');
  }
  if (ipSignups24h >= 5) {
    score += 3;
    signals.push(`signup_velocity_${ipSignups24h}_24h`);
  } else if (ipSignups24h >= 3) {
    score += 2;
    signals.push(`signup_velocity_${ipSignups24h}_24h`);
  }
  const level = score >= 4 ? 'high' : score >= 2 ? 'elevated' : 'low';
  return { level, score, signals };
}

/** Signups from one hashed IP in the last 24h (best-effort count). */
export async function countSignupsFromIp(ipHash: string | null): Promise<number> {
  if (!ipHash) return 0;
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'USER_SIGNUP')
      .eq('ip_hash', ipHash)
      .gte('created_at', since);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Record a security signal (reversible decisions are rows, not state). */
export async function logSecuritySignal(
  event_type: string,
  severity: 'INFO' | 'WARN' | 'CRITICAL',
  metadata: Record<string, unknown>,
  ipHash?: string | null,
  userId?: string | null,
): Promise<void> {
  try {
    await supabaseAdmin.from('security_events').insert({
      event_type,
      severity,
      user_id: userId ?? null,
      ip_hash: ipHash ?? null,
      metadata,
    });
  } catch {
    /* signals must never break the request they describe */
  }
}

// ---------------------------------------------------------------------------
// Generation budgets (ladder steps 2-3), backed by the ai_usage ledger.
// ---------------------------------------------------------------------------

export function intEnv(name: string, fallback: number): number {
  const raw = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/** Per-IP daily budget across all generation features (0 disables). */
export function freeToolIpDailyBudget(): number {
  return intEnv('GEN_IP_DAILY_BUDGET', 60);
}

/** Global anonymous daily budget (0 disables). */
export function anonymousGlobalDailyBudget(): number {
  return intEnv('GEN_ANON_GLOBAL_DAILY_BUDGET', 2000);
}

export interface BudgetCounts {
  ipToday: number;
  anonymousGlobalToday: number;
}

export type BudgetDecision =
  | { blocked: false }
  | { blocked: true; reason: 'IP_DAILY_BUDGET' | 'GLOBAL_DAILY_BUDGET'; retryAfterHours: number };

/** Pure decision function (unit-tested): which budget, if any, is exhausted. */
export function budgetDecision(
  counts: BudgetCounts,
  ipBudget = freeToolIpDailyBudget(),
  globalBudget = anonymousGlobalDailyBudget(),
): BudgetDecision {
  if (ipBudget > 0 && counts.ipToday >= ipBudget) {
    return { blocked: true, reason: 'IP_DAILY_BUDGET', retryAfterHours: hoursUntilUtcMidnight() };
  }
  if (globalBudget > 0 && counts.anonymousGlobalToday >= globalBudget) {
    return { blocked: true, reason: 'GLOBAL_DAILY_BUDGET', retryAfterHours: hoursUntilUtcMidnight() };
  }
  return { blocked: false };
}

export function hoursUntilUtcMidnight(): number {
  const now = new Date();
  const msLeft = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  return Math.max(1, Math.ceil(msLeft / 3600 / 1000));
}

/** Count today's ledger rows for the budgets (best-effort). The per-IP budget
 *  counts only free-tool rows (account-metered generation is not IP abuse);
 *  the global budget counts all anonymous rows. */
export async function countBudgetUsage(ipHash: string | null): Promise<BudgetCounts> {
  const dayStart = new Date().toISOString().slice(0, 10);
  try {
    const [ipCount, anonCount] = await Promise.all([
      ipHash
        ? supabaseAdmin
            .from('ai_usage')
            .select('id', { count: 'exact', head: true })
            .eq('ip_hash', ipHash)
            .like('feature', 'free-tool.%')
            .gte('created_at', `${dayStart}T00:00:00Z`)
        : Promise.resolve({ count: 0 as number | null }),
      supabaseAdmin
        .from('ai_usage')
        .select('id', { count: 'exact', head: true })
        .is('user_id', null)
        .gte('created_at', `${dayStart}T00:00:00Z`),
    ]);
    return {
      ipToday: (ipCount as { count?: number | null }).count ?? 0,
      anonymousGlobalToday: (anonCount as { count?: number | null }).count ?? 0,
    };
  } catch {
    return { ipToday: 0, anonymousGlobalToday: 0 };
  }
}
