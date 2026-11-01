/**
 * Jobiest pricing & entitlement catalog - single source of truth for plan
 * names, prices, monthly successful-application allowances, AI quotas, and
 * feature copy. Consumed by the marketing pricing page, the in-app billing
 * page, admin surfaces, and server-side billing/entitlement guards (mirrored
 * in SQL: supabase/migrations/059_subscription_ultra_and_application_ledger.sql).
 *
 * Prices are set in Naira (₦) as the Nigeria billing currency and USD ($) for
 * international checkouts; see lib/billing/currency.ts.
 */

export type PlanCode = 'FREE' | 'BASIC' | 'PREMIUM' | 'ULTRA';
export type PaidPlanCode = 'BASIC' | 'PREMIUM' | 'ULTRA';
export type LegacyPlanInput = PlanCode | 'MAX';

export interface PlanDefinition {
  code: PlanCode;
  name: 'Free' | 'Basic' | 'Premium' | 'Ultra';
  tagline: string;
  /** Monthly price in Naira (major units). FREE is 0. */
  monthlyNgn: number;
  /** Monthly USD list price for visitors outside Nigeria. FREE is 0. */
  monthlyUsd: number;
  /** AI document generations per day (0 for FREE: FREE uses lifetimeDocs). */
  documentCredits: number;
  /** Total AI generations ever on FREE (null = not applicable). */
  lifetimeDocs: number | null;
  /** Successful job applications included per billing month (null = unlimited on ULTRA). */
  monthlySuccessfulApplications: number | null;
  /** True when monthly successful job applications are unlimited (ULTRA). */
  unlimitedApplications: boolean;
  /** Free career-tool uses per day (null = unlimited). */
  toolUses: number | null;
  highlight: string;
  features: string[];
  cta: string;
  ctaHref: string;
  featured?: boolean;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  FREE: {
    code: 'FREE',
    name: 'Free',
    tagline: 'Profile, matching, tracker, all 30 resume templates, and every career tool. No card required.',
    monthlyNgn: 0,
    monthlyUsd: 0,
    documentCredits: 0,
    lifetimeDocs: 3,
    monthlySuccessfulApplications: 0,
    unlimitedApplications: false,
    toolUses: 10,
    highlight: '₦0 forever',
    features: [
      '3 AI generations in total to try the AI writer (resume, cover letter, answers)',
      'All 30 ISO A4 resume & CV templates with PDF and Word DOCX export',
      'All 10 free career tools; 10 uses a day',
      'ATS resume scanner & job link paste analysis',
      'Profile builder & application tracker',
      'Community support',
    ],
    cta: 'Start free',
    ctaHref: '/signup',
  },
  BASIC: {
    code: 'BASIC',
    name: 'Basic',
    tagline: 'Daily tailored documents plus 30 successful job applications each billing month.',
    monthlyNgn: 5000,
    monthlyUsd: 3.99,
    documentCredits: 3,
    lifetimeDocs: null,
    monthlySuccessfulApplications: 30,
    unlimitedApplications: false,
    toolUses: 50,
    highlight: '₦5,000 / month',
    features: [
      'Everything in Free',
      '30 successful job applications per billing month (failed or stopped attempts never count)',
      '3 AI document generations a day',
      '50 career-tool uses a day',
      'Follow-up email writer',
      'Priority email support',
    ],
    cta: 'Choose Basic',
    ctaHref: '/signup',
  },
  PREMIUM: {
    code: 'PREMIUM',
    name: 'Premium',
    tagline: 'Daily job discovery and 50 successful job applications every billing month.',
    monthlyNgn: 10000,
    monthlyUsd: 7.99,
    documentCredits: 10,
    lifetimeDocs: null,
    monthlySuccessfulApplications: 50,
    unlimitedApplications: false,
    toolUses: null,
    highlight: '₦10,000 / month',
    features: [
      'Everything in Basic',
      '50 successful job applications per billing month (approve each send, or switch to Auto)',
      '10 AI document generations a day',
      'Your agent finds matching jobs daily',
      'Unlimited career-tool uses',
      'Priority AI processing & faster queue',
      'Salary insights & interview prep unlimited',
    ],
    cta: 'Choose Premium',
    ctaHref: '/signup',
    featured: true,
  },
  ULTRA: {
    code: 'ULTRA',
    name: 'Ultra',
    tagline: 'Unlimited monthly job applications for heavy searches, with full human control.',
    monthlyNgn: 20000,
    monthlyUsd: 14.99,
    documentCredits: 20,
    lifetimeDocs: null,
    monthlySuccessfulApplications: null,
    unlimitedApplications: true,
    toolUses: null,
    highlight: '₦20,000 / month',
    features: [
      'Everything in Premium',
      'Unlimited successful job applications per month (approve each send, or switch to Auto)',
      '20 AI document generations a day',
      'Your agent finds matching jobs daily',
      'Unlimited career-tool uses',
      'Highest priority processing for active searches',
      'Concierge support & early access',
    ],
    cta: 'Choose Ultra',
    ctaHref: '/signup',
  },
};

export const PLAN_ORDER: PlanCode[] = ['FREE', 'BASIC', 'PREMIUM', 'ULTRA'];
export const PAID_PLAN_ORDER: PaidPlanCode[] = ['BASIC', 'PREMIUM', 'ULTRA'];

export function normalizePlanCode(raw: unknown): PlanCode {
  const upper = String(raw ?? '').trim().toUpperCase();
  if (upper === 'ULTRA' || upper === 'MAX') return 'ULTRA';
  if (upper === 'PREMIUM') return 'PREMIUM';
  if (upper === 'BASIC') return 'BASIC';
  return 'FREE';
}

export function normalizePaidPlanCode(raw: unknown): PaidPlanCode | null {
  const code = normalizePlanCode(raw);
  return code === 'FREE' ? null : code;
}

export function displayPlanName(raw: unknown): PlanDefinition['name'] {
  return PLANS[normalizePlanCode(raw)].name;
}

export function monthlyApplicationsLabel(raw: unknown): string {
  const plan = PLANS[normalizePlanCode(raw)];
  if (plan.unlimitedApplications) return 'Unlimited successful applications / month';
  if (plan.monthlySuccessfulApplications && plan.monthlySuccessfulApplications > 0) {
    return `${plan.monthlySuccessfulApplications} successful applications / month`;
  }
  return 'Manual apply (upgrade for monthly agent submissions)';
}
