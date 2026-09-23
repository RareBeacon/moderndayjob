/**
 * Application approval state machine (Wave 3).
 *
 * Pure decision logic; no I/O, no Supabase; so every transition and gate is
 * unit-testable. The service layer (lib/applications/service.ts) collects the
 * gate context from the DB and applies the decision it gets back.
 *
 * Statuses are stored on `applications.status` (free text). Assisted flow:
 *
 *   (new) ─prepare─▶ PREPARING ─package complete─▶ AWAITING_APPROVAL
 *                                                    │ approve  ▼
 *   APPROVED ─submit(handoff)─▶ SUBMITTED          APPROVED
 *   AWAITING_APPROVAL ─reject─▶ REJECTED
 *   PREPARING|AWAITING_APPROVAL|APPROVED ─withdraw─▶ WITHDRAWN
 *
 * Autonomous submission is deliberately NOT part of this state machine
 * (Wave 4); "submit" here is the assisted handoff; the user confirms and we
 * record it, nothing is sent to a third party automatically.
 */

export const APPLICATION_STATUSES = [
  'DRAFT',
  'PREPARING',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SUBMITTED',
  'INTERVIEW',
  'REJECTED',
  'WITHDRAWN',
  'FAILED',
  'QUEUED',
  // Auto-Apply 2.0 (M4): the automated flow's own outcomes.
  'AWAITING_VERIFICATION', // send unconfirmed (timeout / no success signal)
  'AWAITING_USER_INPUT',   // the robot stopped; a human decides what is next
  'CANCELLED',             // autonomous run cancelled before submission
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Gate failure codes; surfaced to the UI as friendly messages. */
export type GateCode =
  | 'NOT_FOUND'
  | 'EXPIRED_JOB'
  | 'REQUIRED_FIELDS_MISSING'
  | 'DUPLICATE'
  | 'UNAUTHORIZED'
  | 'INVALID_TRANSITION'
  | 'ALREADY_IN_STATE';

/** Everything the gates need, collected by the service layer. */
export interface GateContext {
  jobExists: boolean;
  jobExpired: boolean;
  /** Application email present (application.email non-empty). */
  hasEmail: boolean;
  /** Package present: ≥1 generated document for the app or an uploaded CV. */
  hasPackage: boolean;
}

export interface Decision {
  ok: boolean;
  next: ApplicationStatus | null;
  code?: GateCode;
}

const ok = (next: ApplicationStatus): Decision => ({ ok: true, next });
const fail = (code: GateCode): Decision => ({ ok: false, next: null, code });

const ACTIVE_FOR_PREPARE: ApplicationStatus[] = [
  'DRAFT',
  'PREPARING',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SUBMITTED',
  'QUEUED',
];

/** Statuses a NEW prepare may transition from. */
export function prepareReady(from: ApplicationStatus): boolean {
  return ACTIVE_FOR_PREPARE.includes(from);
}

/**
 * decidePrepare: create (or refresh) an application from a job.
 * `from` is null for a brand-new application, otherwise the existing status.
 * Idempotent for applications already in the approval pipeline.
 */
export function decidePrepare(from: ApplicationStatus | null, ctx: GateContext): Decision {
  if (!ctx.jobExists) return fail('NOT_FOUND');
  if (ctx.jobExpired) return fail('EXPIRED_JOB');
  if (from && ['AWAITING_APPROVAL', 'APPROVED', 'SUBMITTED'].includes(from)) {
    return { ok: true, next: from, code: 'ALREADY_IN_STATE' };
  }
  return ok(ctx.hasEmail && ctx.hasPackage ? 'AWAITING_APPROVAL' : 'PREPARING');
}

/** decideApprove: AWAITING_APPROVAL → APPROVED, gated. Idempotent. */
export function decideApprove(from: ApplicationStatus, ctx: GateContext): Decision {
  if (from === 'APPROVED') return { ok: true, next: 'APPROVED', code: 'ALREADY_IN_STATE' };
  if (from !== 'AWAITING_APPROVAL') return fail('INVALID_TRANSITION');
  if (ctx.jobExpired) return fail('EXPIRED_JOB');
  if (!ctx.hasEmail || !ctx.hasPackage) return fail('REQUIRED_FIELDS_MISSING');
  return ok('APPROVED');
}

/** decideReject: AWAITING_APPROVAL → REJECTED. Idempotent. */
export function decideReject(from: ApplicationStatus): Decision {
  if (from === 'REJECTED') return { ok: true, next: 'REJECTED', code: 'ALREADY_IN_STATE' };
  if (from !== 'AWAITING_APPROVAL') return fail('INVALID_TRANSITION');
  return ok('REJECTED');
}

/** decideWithdraw: pull an active, unsubmitted application. Idempotent.
 *  M4: applications parked in the automated flow's terminal-ish states can
 *  also be withdrawn (the user takes them back). */
export function decideWithdraw(from: ApplicationStatus): Decision {
  if (from === 'WITHDRAWN') return { ok: true, next: 'WITHDRAWN', code: 'ALREADY_IN_STATE' };
  if (!['PREPARING', 'AWAITING_APPROVAL', 'APPROVED', 'QUEUED', 'AWAITING_VERIFICATION', 'AWAITING_USER_INPUT'].includes(from)) {
    return fail('INVALID_TRANSITION');
  }
  return ok('WITHDRAWN');
}

/** M4: map an automated submission outcome to the application's next status.
 *  Confirmed sends are SUBMITTED; unconfirmed sends park in
 *  AWAITING_VERIFICATION (never auto-resubmitted: no task is re-queued for
 *  them and decideSubmit refuses the state); stops park in
 *  AWAITING_USER_INPUT with the reason recorded on the application. */
export function decideAutoOutcome(from: ApplicationStatus, outcome: 'SUBMITTED' | 'UNKNOWN' | 'STOP'): Decision {
  if (from === 'SUBMITTED') return { ok: true, next: 'SUBMITTED', code: 'ALREADY_IN_STATE' };
  if (from !== 'APPROVED' && from !== 'QUEUED') return fail('INVALID_TRANSITION');
  if (outcome === 'SUBMITTED') return ok('SUBMITTED');
  if (outcome === 'UNKNOWN') return ok('AWAITING_VERIFICATION');
  return ok('AWAITING_USER_INPUT');
}

/** decideSubmit: APPROVED → SUBMITTED (assisted handoff). Idempotent. */
export function decideSubmit(from: ApplicationStatus): Decision {
  if (from === 'SUBMITTED') return { ok: true, next: 'SUBMITTED', code: 'ALREADY_IN_STATE' };
  if (from !== 'APPROVED') return fail('INVALID_TRANSITION');
  return ok('SUBMITTED');
}
