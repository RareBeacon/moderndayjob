/**
 * Plan quotas (mirrored in SQL: supabase/migrations/013_entitlement_quotas_v2.sql).
 * - dailyCredits      → AI document generations/day for paid plans (0 for FREE:
 *                       FREE uses lifetimeDocs instead)
 * - lifetimeDocs      → total AI documents ever on FREE (null = not applicable)
 * - dailyApplications → auto-apply agent-mode slots/day for PREMIUM/MAX
 *                       (0 = no daily allowance)
 * - lifetimeApplications → total auto-apply trial uses on BASIC (null = n/a)
 * - dailyTools        → free career-tool uses/day (Infinity = unlimited)
 * - priceKobo         → monthly price in kobo (₦5,000 = 500000 kobo)
 *
 * Agent mode (auto-apply) is a Premium/Max feature. Basic gets 2 lifetime
 * trial uses. Free is manual-apply only. There is no universal trial.
 */
export const PLANS = {
  FREE: { priceKobo: 0, monthlyNgn: 0, dailyCredits: 0, lifetimeDocs: 3, dailyApplications: 0, lifetimeApplications: null, dailyTools: 10 },
  BASIC: { priceKobo: 500000, monthlyNgn: 5000, dailyCredits: 3, lifetimeDocs: null, dailyApplications: 0, lifetimeApplications: 2, dailyTools: 50 },
  PREMIUM: { priceKobo: 1000000, monthlyNgn: 10000, dailyCredits: 10, lifetimeDocs: null, dailyApplications: 10, lifetimeApplications: null, dailyTools: Infinity },
  MAX: { priceKobo: 2000000, monthlyNgn: 20000, dailyCredits: 20, lifetimeDocs: null, dailyApplications: 20, lifetimeApplications: null, dailyTools: Infinity },
} as const;
export type Plan = keyof typeof PLANS;
export function trialActive(status: string, ends: string | null) {
  return status === 'TRIAL' && !!ends && new Date(ends) > new Date();
}
