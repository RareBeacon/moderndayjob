/**
 * Jobiest pricing catalog — single source of truth for plan names, prices,
 * quotas and feature copy. Consumed by the marketing pricing page, the
 * in-app billing page, and the billing guards (which enforce the same numbers
 * in SQL — see supabase/migrations/012_pricing_tiers.sql).
 *
 * Prices are set in Naira (₦) as the billing base currency; the pricing page
 * converts them for display using lib/billing/currency.ts.
 */

export type PlanCode = 'FREE' | 'BASIC' | 'PREMIUM' | 'MAX';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  tagline: string;
  /** Monthly price in Naira (major units). FREE is 0. */
  monthlyNgn: number;
  /** AI document generations per day (resume, cover letter, answers). */
  documentCredits: number;
  /** Auto-apply automation slots per day (0 = not entitled). */
  automationSlots: number;
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
    tagline: 'Everything you need to start applying, free forever.',
    monthlyNgn: 0,
    documentCredits: 3,
    automationSlots: 0,
    toolUses: 10,
    highlight: '₦0 forever',
    features: [
      '3 AI documents a day (resume, cover letter, answers)',
      'All 10 career tools — 10 uses a day',
      'ATS resume scanner',
      'Job search & match scoring',
      'Profile builder & application tracker',
      'Community support',
    ],
    cta: 'Start free',
    ctaHref: '/signup',
  },
  BASIC: {
    code: 'BASIC',
    name: 'Basic',
    tagline: 'For active job seekers who want automation on their side.',
    monthlyNgn: 5000,
    documentCredits: 10,
    automationSlots: 10,
    toolUses: 50,
    highlight: '₦5,000 / month',
    features: [
      'Everything in Free',
      '10 AI documents a day',
      '50 career-tool uses a day',
      '10 auto-apply slots a day (approval mode)',
      'Follow-up email writer',
      'Priority email support',
    ],
    cta: 'Choose Basic',
    ctaHref: '/signup',
  },
  PREMIUM: {
    code: 'PREMIUM',
    name: 'Premium',
    tagline: 'Double the volume, unlimited tools, faster everything.',
    monthlyNgn: 10000,
    documentCredits: 20,
    automationSlots: 20,
    toolUses: null,
    highlight: '₦10,000 / month',
    features: [
      'Everything in Basic',
      '20 AI documents a day',
      'Unlimited career-tool uses',
      '20 auto-apply slots a day',
      'Priority AI processing & faster queue',
      'Salary insights & interview prep unlimited',
    ],
    cta: 'Choose Premium',
    ctaHref: '/signup',
    featured: true,
  },
  MAX: {
    code: 'MAX',
    name: 'Max',
    tagline: 'For power users and agencies. Everything, with a human in the loop.',
    monthlyNgn: 20000,
    documentCredits: 40,
    automationSlots: 40,
    toolUses: null,
    highlight: '₦20,000 / month',
    features: [
      'Everything in Premium',
      '40 AI documents a day',
      '40 auto-apply slots a day',
      'Unlimited everything',
      'Human-reviewed applications',
      'Concierge support & early access',
    ],
    cta: 'Choose Max',
    ctaHref: '/signup',
  },
};

export const PLAN_ORDER: PlanCode[] = ['FREE', 'BASIC', 'PREMIUM', 'MAX'];
