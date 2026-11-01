import type { ClosureSignal, LifecycleStatus } from '../types';

/**
 * Multi-Observation Vacancy Expiration State Machine (Condition 3)
 *
 * Guarantees:
 * 1. Transient poll failures (HTTP 429, 5xx, network timeout, DNS error),
 *    conditional 304/unchanged responses, paginated partial reads, and
 *    anomalous empty board drops (e.g. a 150-job board suddenly returning 0
 *    items without an authoritative closure signal) NEVER expire vacancies or
 *    advance absence counters.
 * 2. Authoritative closure signals (HTTP 404/410 on an individual job detail URL,
 *    ATS `closed` status flag, Google/Tally Form `isAcceptingResponses === false`,
 *    first-party portal `CLOSED`, or explicit `validThrough` past grace window)
 *    expire immediately with provenance in `closureSignal`.
 * 3. Otherwise, absence from a complete `200 OK` board snapshot requires at least
 *    `REQUIRED_ABSENCE_OBSERVATIONS = 3` consecutive complete observations spanning
 *    at least `MIN_ABSENCE_WINDOW_MS = 24 hours` before transitioning to `EXPIRED`.
 */

export const REQUIRED_ABSENCE_OBSERVATIONS = 3;
export const MIN_ABSENCE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ANOMALOUS_EMPTY_DROP_PRIOR_MIN = 5;

export interface CurrentJobLifecycleState {
  lifecycleStatus: LifecycleStatus;
  missingPollStreak: number;
  firstMissingAt: string | null;
  lastSeenAt: string;
  lastConfirmedLiveAt: string;
  expiredAt: string | null;
  closureSignal: ClosureSignal;
  validThrough?: string | null;
}

export type PollObservationEvent =
  | {
      kind: 'OBSERVED_PRESENT';
      atIso: string;
    }
  | {
      kind: 'POLL_FAILED_OR_INCOMPLETE';
      atIso: string;
      reason: 'HTTP_ERROR' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'PARTIAL_PAGINATION';
    }
  | {
      kind: 'SOURCE_NOT_MODIFIED';
      atIso: string;
    }
  | {
      kind: 'ABSENT_FROM_COMPLETE_SNAPSHOT';
      atIso: string;
      previousSourceItemCount: number | null;
      currentSourceItemCount: number;
    }
  | {
      kind: 'AUTHORITATIVE_CLOSURE';
      atIso: string;
      signal: Exclude<ClosureSignal, 'NONE' | 'MULTI_POLL_ABSENCE_CONFIRMED'>;
    };

export interface LifecycleTransitionResult {
  next: CurrentJobLifecycleState;
  anomalousDropProtected: boolean;
}

export function isAnomalousEmptyBoardDrop(
  previousItemCount: number | null | undefined,
  currentItemCount: number,
): boolean {
  if (currentItemCount > 0) return false;
  if (previousItemCount == null) return false;
  return previousItemCount >= ANOMALOUS_EMPTY_DROP_PRIOR_MIN;
}

export function stepJobLifecycle(
  current: CurrentJobLifecycleState,
  event: PollObservationEvent,
): LifecycleTransitionResult {
  // Takedowns and quarantined scam rows are sticky until admin action.
  if (current.lifecycleStatus === 'TAKEDOWN' || current.lifecycleStatus === 'QUARANTINED') {
    return { next: { ...current }, anomalousDropProtected: false };
  }

  if (event.kind === 'OBSERVED_PRESENT') {
    return {
      anomalousDropProtected: false,
      next: {
        lifecycleStatus: 'ACTIVE',
        missingPollStreak: 0,
        firstMissingAt: null,
        lastSeenAt: event.atIso,
        lastConfirmedLiveAt: event.atIso,
        expiredAt: null,
        closureSignal: 'NONE',
        validThrough: current.validThrough ?? null,
      },
    };
  }

  if (event.kind === 'SOURCE_NOT_MODIFIED') {
    // 304 Not Modified on a healthy feed confirms previously active jobs remain live.
    if (current.lifecycleStatus === 'ACTIVE') {
      return {
        anomalousDropProtected: false,
        next: {
          ...current,
          lastSeenAt: event.atIso,
          lastConfirmedLiveAt: event.atIso,
        },
      };
    }
    return { next: { ...current }, anomalousDropProtected: false };
  }

  if (event.kind === 'POLL_FAILED_OR_INCOMPLETE') {
    // Condition 3: NEVER expire or increment absence streak when polling fails or is partial!
    return { next: { ...current }, anomalousDropProtected: false };
  }

  if (event.kind === 'AUTHORITATIVE_CLOSURE') {
    return {
      anomalousDropProtected: false,
      next: {
        ...current,
        lifecycleStatus: 'EXPIRED',
        expiredAt: current.expiredAt ?? event.atIso,
        closureSignal: event.signal,
      },
    };
  }

  // event.kind === 'ABSENT_FROM_COMPLETE_SNAPSHOT'
  if (isAnomalousEmptyBoardDrop(event.previousSourceItemCount, event.currentSourceItemCount)) {
    return {
      next: { ...current },
      anomalousDropProtected: true,
    };
  }

  const firstMissingIso = current.firstMissingAt ?? event.atIso;
  const nextStreak = current.missingPollStreak + 1;
  const elapsedMs = Math.max(0, new Date(event.atIso).getTime() - new Date(firstMissingIso).getTime());

  if (nextStreak >= REQUIRED_ABSENCE_OBSERVATIONS && elapsedMs >= MIN_ABSENCE_WINDOW_MS) {
    return {
      anomalousDropProtected: false,
      next: {
        ...current,
        lifecycleStatus: 'EXPIRED',
        missingPollStreak: nextStreak,
        firstMissingAt: firstMissingIso,
        expiredAt: current.expiredAt ?? event.atIso,
        closureSignal: 'MULTI_POLL_ABSENCE_CONFIRMED',
      },
    };
  }

  return {
    anomalousDropProtected: false,
    next: {
      ...current,
      lifecycleStatus: 'POTENTIALLY_CLOSING',
      missingPollStreak: nextStreak,
      firstMissingAt: firstMissingIso,
    },
  };
}

/** Adaptive poll interval calculator: active hiring boards poll faster; quiet boards back off. */
export function computeAdaptivePollIntervalMinutes(params: {
  defaultIntervalMinutes: number;
  hadChanges: boolean;
  consecutiveUnchangedPolls: number;
  activeOpeningsCount: number;
}): number {
  const base = Math.max(30, params.defaultIntervalMinutes);
  if (params.hadChanges) {
    return Math.max(60, Math.floor(base * 0.5));
  }
  if (params.activeOpeningsCount === 0 && params.consecutiveUnchangedPolls >= 3) {
    return Math.min(1440, base * 4);
  }
  if (params.consecutiveUnchangedPolls >= 4) {
    return Math.min(720, base * 2);
  }
  return base;
}
