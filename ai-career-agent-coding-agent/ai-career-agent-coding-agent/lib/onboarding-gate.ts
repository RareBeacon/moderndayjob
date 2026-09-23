import type { User } from '@supabase/supabase-js';
import { getProfileCompleteness } from '@/lib/profile-completeness';

/**
 * Onboarding gate (Enterprise upgrade Milestone 1).
 *
 * Directive Phase 5: an email-verified user must not access protected product
 * sections until onboarding completion reaches 85%. Enforcement is
 * server-side; the frontend only routes to the wizard.
 *
 * Scope rules (owner decision D6):
 *  - The gate applies only to accounts created on/after ONBOARDING_GATE_EPOCH
 *    (accounts that existed before are never locked out; they see prompts).
 *  - The gate is armed by ONBOARDING_GATE_ENABLED=true, read at call time so
 *    it can be flipped without a rebuild and exercised in tests. Until the
 *    wizard's gate-aware UI ships, the flag stays OFF in production.
 *  - The gate never blocks profile/onboarding writes themselves; a blocked
 *    user must always be able to finish onboarding.
 */

export const ONBOARDING_THRESHOLD = 85;

/** Accounts created before this instant are never gated. */
const DEFAULT_EPOCH = '2026-10-01T00:00:00Z';

export type OnboardingGateResult = {
  allowed: boolean;
  /** True when the gate was actually evaluated for this account. */
  applied: boolean;
  percent: number;
  next: string[];
};

/**
 * Pure cohort check (no queries): the gate is armed AND this account was
 * created on/after the epoch. Used by the dashboard to render the wizard as
 * required, and by onboardingGate for enforcement.
 */
export function isGatedCohort(createdAt?: string | null): boolean {
  if (process.env.ONBOARDING_GATE_ENABLED !== 'true') return false;
  const epoch = process.env.ONBOARDING_GATE_EPOCH ?? DEFAULT_EPOCH;
  const createdMs = createdAt ? new Date(createdAt).getTime() : 0;
  return createdMs >= new Date(epoch).getTime();
}

export async function onboardingGate(user: Pick<User, 'id' | 'created_at'>): Promise<OnboardingGateResult> {
  if (!isGatedCohort(user.created_at)) {
    // Inert: no completeness queries run on any request outside the gated
    // cohort, so arming the gate is the only change (zero overhead before).
    return { allowed: true, applied: false, percent: 0, next: [] };
  }
  const completeness = await getProfileCompleteness(user.id);
  return {
    allowed: completeness.percent >= ONBOARDING_THRESHOLD,
    applied: true,
    percent: completeness.percent,
    next: completeness.next,
  };
}

/**
 * 403 response for a gated, incomplete account; null when the caller may
 * proceed. Routes use it right after requireUser:
 *
 *   const gate = await onboardingGateResponse(user);
 *   if (gate) return gate;
 */
export async function onboardingGateResponse(user: Pick<User, 'id' | 'created_at'>): Promise<Response | null> {
  const gate = await onboardingGate(user);
  if (gate.allowed) return null;
  return Response.json(
    { error: 'ONBOARDING_REQUIRED', completeness: gate.percent, next: gate.next },
    { status: 403 },
  );
}
