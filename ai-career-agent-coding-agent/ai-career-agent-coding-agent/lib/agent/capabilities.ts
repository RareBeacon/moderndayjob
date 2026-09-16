/**
 * Agent capability policy engine (Master Implementation Package B-220,
 * requirements 217/226-228, DoD 15).
 *
 * Deny by default: every capability the agent can exercise must be declared
 * here with its side-effect class. A capability that is not in the registry is
 * refused, whatever the caller asks for. The engine is PURE (no I/O) so the
 * full decision matrix is unit-testable; callers audit denials at the seam.
 *
 * Kill switches (B-224):
 *   - global:  AUTOMATION_SUBMIT_ENABLED (existing, lib/applications service)
 *   - dry-run: AGENT_DRY_RUN=true lets the agent prepare but never perform an
 *              external side effect.
 *   - source:  job_sources.enabled (per-source, discovery registry).
 *   - user:    job_preferences.active (existing pause).
 */
import { auditEvent } from '@/lib/audit';

export type Capability =
  | 'job_board.read'
  | 'job_board.fetch_page'
  | 'document.generate'
  | 'application.auto_submit'
  | 'application.email_handoff';

interface CapabilityRule {
  /** Human description used in audit rows and error messages. */
  description: string;
  /** True when the capability has an effect outside Jobiest. */
  externalSideEffect: boolean;
}

/** The complete allowlist. Anything else is denied by default. */
const REGISTRY: Record<Capability, CapabilityRule> = {
  'job_board.read': { description: 'Read a public job board API', externalSideEffect: false },
  'job_board.fetch_page': { description: 'Fetch one job page for validation', externalSideEffect: false },
  'document.generate': { description: 'Generate a document from verified profile facts', externalSideEffect: false },
  'application.auto_submit': { description: 'Submit an approved application on the user\'s behalf', externalSideEffect: true },
  'application.email_handoff': { description: 'Hand an approved application to the user for sending', externalSideEffect: true },
};

export interface PolicyContext {
  /** Global automation kill switch (AUTOMATION_SUBMIT_ENABLED). */
  automationEnabled: boolean;
  /** Dry-run mode: prepare everything, perform no external side effect. */
  dryRun: boolean;
  /** Per-source switch for discovery capabilities. */
  sourceEnabled?: boolean;
}

export type PolicyDecision =
  | { allowed: true; capability: Capability }
  | { allowed: false; capability: string; reason: 'UNKNOWN_CAPABILITY' | 'AUTOMATION_DISABLED' | 'SOURCE_DISABLED' | 'DRY_RUN'; description?: string };

/** Pure check: registry membership + kill switches. Deny by default. */
export function checkCapability(requested: string, ctx: PolicyContext): PolicyDecision {
  const rule = (REGISTRY as Record<string, CapabilityRule | undefined>)[requested];
  if (!rule) {
    return { allowed: false, capability: requested, reason: 'UNKNOWN_CAPABILITY' };
  }
  const cap = requested as Capability;
  if (rule.externalSideEffect && cap === 'application.auto_submit' && !ctx.automationEnabled) {
    return { allowed: false, capability: cap, reason: 'AUTOMATION_DISABLED', description: rule.description };
  }
  if (cap === 'job_board.read' && ctx.sourceEnabled === false) {
    return { allowed: false, capability: cap, reason: 'SOURCE_DISABLED', description: rule.description };
  }
  if (rule.externalSideEffect && ctx.dryRun) {
    return { allowed: false, capability: cap, reason: 'DRY_RUN', description: rule.description };
  }
  return { allowed: true, capability: cap };
}

/** Audited check for use at the seam before a side effect (best-effort row). */
export async function checkCapabilityAudited(
  requested: string,
  ctx: PolicyContext,
  actor?: { userId?: string | null; applicationId?: string | null },
): Promise<PolicyDecision> {
  const decision = checkCapability(requested, ctx);
  if (!decision.allowed) {
    void auditEvent({
      action: 'AGENT_CAPABILITY_DENIED',
      resource: 'agent',
      ...(actor?.applicationId ? { resourceId: actor.applicationId } : {}),
      userId: actor?.userId ?? null,
      outcome: 'deny',
      meta: {
        capability: decision.capability,
        reason: decision.reason,
        ...(decision.description ? { description: decision.description } : {}),
      },
    });
  }
  return decision;
}

/** All declared capabilities (for docs/tests). */
export function declaredCapabilities(): Capability[] {
  return Object.keys(REGISTRY) as Capability[];
}

/** Dry-run mode from env (B-224). */
export function agentDryRun(): boolean {
  return process.env.AGENT_DRY_RUN === 'true';
}
