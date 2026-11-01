/**
 * Authoritative Plan Quotas & Pricing Constants
 * (Mirrored in SQL: supabase/migrations/059_subscription_ultra_and_application_ledger.sql
 *  and UI catalog: lib/billing/pricing.ts)
 *
 * - Free    : ₦0 / $0 - 3 lifetime AI writer docs (5 monthly ledger credits),
 *             all 30 resume/CV templates + PDF/DOCX export, 10 career-tool uses/day.
 * - Basic   : ₦5,000 / $3.99 per month - 30 successful job applications per billing month,
 *             3 AI generations/day, 50 career-tool uses/day.
 * - Premium : ₦10,000 / $7.99 per month - 50 successful job applications per billing month,
 *             10 AI generations/day, unlimited career-tool uses.
 * - Ultra   : ₦20,000 / $14.99 per month (renamed from Max) - Unlimited successful job
 *             applications per billing month (subject to platform anti-abuse safety limits,
 *             job-board ToS, duplicate prevention, and user approval settings),
 *             20 AI generations/day, unlimited career-tool uses.
 */
export const PLANS = {
  FREE: {
    priceKobo: 0,
    monthlyNgn: 0,
    monthlyUsd: 0,
    dailyCredits: 0,
    lifetimeDocs: 3,
    monthlyDocumentCredits: 5,
    monthlySuccessfulApplications: 0 as number | null,
    unlimitedApplications: false,
    dailyTools: 10,
  },
  BASIC: {
    priceKobo: 500000,
    monthlyNgn: 5000,
    monthlyUsd: 3.99,
    dailyCredits: 3,
    lifetimeDocs: null,
    monthlyDocumentCredits: 15,
    monthlySuccessfulApplications: 30 as number | null,
    unlimitedApplications: false,
    dailyTools: 50,
  },
  PREMIUM: {
    priceKobo: 1000000,
    monthlyNgn: 10000,
    monthlyUsd: 7.99,
    dailyCredits: 10,
    lifetimeDocs: null,
    monthlyDocumentCredits: 30,
    monthlySuccessfulApplications: 50 as number | null,
    unlimitedApplications: false,
    dailyTools: Infinity,
  },
  ULTRA: {
    priceKobo: 2000000,
    monthlyNgn: 20000,
    monthlyUsd: 14.99,
    dailyCredits: 20,
    lifetimeDocs: null,
    monthlyDocumentCredits: 100,
    monthlySuccessfulApplications: null as number | null,
    unlimitedApplications: true,
    dailyTools: Infinity,
  },
} as const;

export type Plan = keyof typeof PLANS;
export type PlanCode = Plan;
export type PaidPlan = Exclude<Plan, 'FREE'>;

/** Normalizes any DB or legacy API plan string (including legacy 'MAX') to the 4 canonical plans. */
export function normalizePlanCode(raw: unknown): Plan {
  const upper = String(raw ?? '').trim().toUpperCase();
  if (upper === 'ULTRA' || upper === 'MAX') return 'ULTRA';
  if (upper === 'PREMIUM') return 'PREMIUM';
  if (upper === 'BASIC') return 'BASIC';
  return 'FREE';
}

export function normalizePaidPlanCode(raw: unknown): PaidPlan | null {
  const normalized = normalizePlanCode(raw);
  return normalized === 'FREE' ? null : normalized;
}

export function displayPlanName(raw: unknown): 'Free' | 'Basic' | 'Premium' | 'Ultra' {
  const code = normalizePlanCode(raw);
  if (code === 'ULTRA') return 'Ultra';
  if (code === 'PREMIUM') return 'Premium';
  if (code === 'BASIC') return 'Basic';
  return 'Free';
}

export function trialActive(status: string, ends: string | null) {
  return status === 'TRIAL' && !!ends && new Date(ends) > new Date();
}
