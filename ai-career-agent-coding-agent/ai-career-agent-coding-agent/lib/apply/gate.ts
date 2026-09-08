import type { StopCode } from './types';

/**
 * Pure gate for automatic submission (Phase 8). Mirrors the style of
 * lib/applications/state-machine.ts: no I/O, so the full decision matrix is
 * unit-testable. The worker calls this BEFORE any browser is touched.
 *
 * Safety order (deliberate): the global kill switch and the user's pause are
 * checked first — before anything else — so a disabled/disable product can
 * never submit regardless of the other inputs.
 */

export type GateCode =
  | 'AUTOMATION_DISABLED'
  | 'AGENT_PAUSED'
  | 'NOT_APPROVED'
  | 'NOT_ENTITLED'
  | 'UNSUPPORTED_PLATFORM'
  | 'EXPIRED_JOB'
  | 'REQUIRED_FIELDS_MISSING'
  | 'TRUTHFULNESS_ISSUE';

export interface AutoSubmitContext {
  /** Global kill switch: env AUTOMATION_SUBMIT_ENABLED === 'true'. */
  automationEnabled: boolean;
  /** Per-user pause: job_preferences.active === false. */
  agentPaused: boolean;
  /** application.status — must be APPROVED (a human approved this one). */
  appStatus: string;
  /** Automation entitlement (plan + account status), computed server-side. */
  entitled: boolean;
  /** The job URL maps to a supported site adapter. */
  adapterSupported: boolean;
  hasEmail: boolean;
  hasPackage: boolean;
  truthfulnessOk: boolean;
  jobExpired: boolean;
}

export type GateResult = { ok: true } | { ok: false; code: GateCode };

export function decideAutoSubmit(ctx: AutoSubmitContext): GateResult {
  if (!ctx.automationEnabled) return { ok: false, code: 'AUTOMATION_DISABLED' };
  if (ctx.agentPaused) return { ok: false, code: 'AGENT_PAUSED' };
  if (ctx.appStatus !== 'APPROVED') return { ok: false, code: 'NOT_APPROVED' };
  if (!ctx.entitled) return { ok: false, code: 'NOT_ENTITLED' };
  if (!ctx.adapterSupported) return { ok: false, code: 'UNSUPPORTED_PLATFORM' };
  if (ctx.jobExpired) return { ok: false, code: 'EXPIRED_JOB' };
  if (!ctx.hasEmail) return { ok: false, code: 'REQUIRED_FIELDS_MISSING' };
  if (!ctx.hasPackage) return { ok: false, code: 'REQUIRED_FIELDS_MISSING' };
  if (!ctx.truthfulnessOk) return { ok: false, code: 'TRUTHFULNESS_ISSUE' };
  return { ok: true };
}

export function messageForGate(code: GateCode): string {
  switch (code) {
    case 'AUTOMATION_DISABLED':
      return 'Automatic submission is not enabled yet.';
    case 'AGENT_PAUSED':
      return 'Your agent is paused. Resume it to enable automatic submission.';
    case 'NOT_APPROVED':
      return 'Only applications you have approved can be submitted automatically.';
    case 'NOT_ENTITLED':
      return 'Your plan does not include automatic submission.';
    case 'UNSUPPORTED_PLATFORM':
      return 'This employer platform is not supported for automatic submission yet.';
    case 'EXPIRED_JOB':
      return 'This job listing is too old to apply to.';
    case 'REQUIRED_FIELDS_MISSING':
      return 'Your application is missing required information (email or a prepared document).';
    case 'TRUTHFULNESS_ISSUE':
      return 'Your generated documents did not pass truthfulness checks.';
  }
}

/** The stop codes the gate can surface are a subset of the apply stop codes. */
export function gateCodeToStop(code: GateCode): StopCode {
  switch (code) {
    case 'UNSUPPORTED_PLATFORM':
      return 'UNSUPPORTED_PLATFORM';
    case 'TRUTHFULNESS_ISSUE':
      return 'TRUTHFULNESS_ISSUE';
    case 'REQUIRED_FIELDS_MISSING':
      return 'MISSING_INFO';
    default:
      return 'POLICY_RESTRICTED';
  }
}
