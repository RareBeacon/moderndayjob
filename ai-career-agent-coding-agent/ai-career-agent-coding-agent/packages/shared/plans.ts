/**
 * Plan quotas (mirrored in SQL: supabase/migrations/012_pricing_tiers.sql).
 * - dailyCredits     → AI document generations/day (resume, cover letter, answers)
 * - dailyApplications → auto-apply automation slots/day (0 = not entitled)
 * - dailyTools       → free career-tool uses/day (Infinity = unlimited)
 * - priceKobo        → monthly price in kobo (₦5,000 = 500000 kobo)
 */
export const PLANS = {
  FREE: { priceKobo: 0, monthlyNgn: 0, dailyCredits: 3, dailyApplications: 0, dailyTools: 10 },
  BASIC: { priceKobo: 500000, monthlyNgn: 5000, dailyCredits: 10, dailyApplications: 10, dailyTools: 50 },
  PREMIUM: { priceKobo: 1000000, monthlyNgn: 10000, dailyCredits: 20, dailyApplications: 20, dailyTools: Infinity },
  MAX: { priceKobo: 2000000, monthlyNgn: 20000, dailyCredits: 40, dailyApplications: 40, dailyTools: Infinity },
} as const;
export type Plan = keyof typeof PLANS;
export function trialActive(status: string, ends: string | null) {
  return status === 'TRIAL' && !!ends && new Date(ends) > new Date();
}
