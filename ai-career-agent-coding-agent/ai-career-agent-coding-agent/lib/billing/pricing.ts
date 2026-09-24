/**
 * Jobiest pricing catalog; single source of truth for plan names, prices,
 * quotas and feature copy. Consumed by the marketing pricing page, the
 * in-app billing page, and the billing guards (which enforce the same numbers
 * in SQL; see supabase/migrations/013_entitlement_quotas_v2.sql).
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
  /** Monthly USD list price for visitors outside Nigeria. FREE is 0. */
  monthlyUsd: number;
  /** AI document generations per day (0 for FREE: FREE uses lifetimeDocs). */
  documentCredits: number;
  /** Total AI generations ever on FREE (null = not applicable). */
  lifetimeDocs: number | null;
  /** Auto-apply agent-mode slots per day (0 = no daily allowance). */
  automationSlots: number;
  /** Total auto-apply trial uses on BASIC (null = not applicable). */
  lifetimeAutomation: number | null;
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
    tagline: 'Profile, matching, tracker, and every career tool. No card required.',
    monthlyNgn: 0,
    monthlyUsd: 0,
    documentCredits: 0,
    lifetimeDocs: 3,
    automationSlots: 0,
    lifetimeAutomation: null,
    toolUses: 10,
    highlight: '₦0 forever',
    features: [
      '3 AI generations in total to try the AI writer (resume, cover letter, answers)',
      'All 10 career tools; 10 uses a day',
      'ATS resume scanner',
      'Paste any job link for agent analysis',
      'Profile builder & application tracker',
      'Community support',
    ],
    cta: 'Start free',
    ctaHref: '/signup',
  },
  BASIC: {
    code: 'BASIC',
    name: 'Basic',
    tagline: 'Daily documents plus a first taste of agent-mode automation.',
    monthlyNgn: 5000,
    monthlyUsd: 3.99,
    documentCredits: 3,
    lifetimeDocs: null,
    automationSlots: 0,
    lifetimeAutomation: 2,
    toolUses: 50,
    highlight: '₦5,000 / month',
    features: [
      'Everything in Free',
      '3 AI generations a day',
      '2 agent-mode trial runs (within them: the agent finds jobs, you choose the send policy)',
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
    tagline: 'Agent mode unlocked, with room to run.',
    monthlyNgn: 10000,
    monthlyUsd: 7.99,
    documentCredits: 10,
    lifetimeDocs: null,
    automationSlots: 10,
    lifetimeAutomation: null,
    toolUses: null,
    highlight: '₦10,000 / month',
    features: [
      'Everything in Basic',
      '10 AI generations a day',
      'Your agent finds matching jobs daily',
      '10 agent-mode applications a day (approve each send, or switch to Auto)',
      'Unlimited career-tool uses',
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
    monthlyUsd: 14.99,
    documentCredits: 20,
    lifetimeDocs: null,
    automationSlots: 20,
    lifetimeAutomation: null,
    toolUses: null,
    highlight: '₦20,000 / month',
    features: [
      'Everything in Premium',
      '20 AI generations a day',
      'Your agent finds matching jobs daily',
      '20 agent-mode applications a day (approve each send, or switch to Auto)',
      'Unlimited everything',
      'Highest daily volume for heavy application runs',
      'Concierge support & early access',
    ],
    cta: 'Choose Max',
    ctaHref: '/signup',
  },
};

export const PLAN_ORDER: PlanCode[] = ['FREE', 'BASIC', 'PREMIUM', 'MAX'];
