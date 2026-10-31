import type { ApplyCandidate, ApplyOutcome } from './types';

/**
 * Browser-worker client. The web app and the agent worker NEVER launch a
 * browser themselves; they POST to the isolated browser worker (Oracle Always
 * Free primary / Render standby via BROWSER_WORKER_URLS or BROWSER_WORKER_URL).
 * This keeps Playwright and unrestricted network egress out of the
 * Vercel/serverless runtime (SECURITY_ARCHITECTURE §Browser automation).
 */

export interface BrowserSubmitRequest {
  jobUrl: string;
  allowedDomains: string[];
  candidate: ApplyCandidate;
}

type RetrySignal = { retry: true; status?: number; error?: string };

/**
 * Worker endpoints, primary first. Reads the comma-separated
 * BROWSER_WORKER_URLS list when present (failover mode), else the legacy
 * single BROWSER_WORKER_URL.
 */
function workerUrls(): string[] {
  const list = process.env.BROWSER_WORKER_URLS ?? process.env.BROWSER_WORKER_URL;
  if (!list) return [];
  return list
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter((u) => u.length > 0);
}

/** Cheap /healthz probe: is this worker awake and ready right now? */
async function isHealthy(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2_500) });
    return res.ok;
  } catch {
    return false;
  }
}

function isRetrySignal(value: ApplyOutcome | RetrySignal): value is RetrySignal {
  return 'retry' in value && value.retry === true;
}

function retryExhaustedOutcome(last: RetrySignal | null): ApplyOutcome {
  if (last?.status) {
    return {
      outcome: 'STOP',
      code: 'POLICY_RESTRICTED',
      message: `The automatic-submission worker failed before submission (${last.status}${last.error ? `: ${last.error}` : ''}).`,
    };
  }
  return {
    outcome: 'STOP',
    code: 'POLICY_RESTRICTED',
    message: 'The automatic-submission worker is unreachable.',
  };
}

/**
 * One submission attempt.
 * - Returns `{ retry: true }` ONLY for network-level failures (connection
 *   refused / DNS / reset) OR explicit pre-submit worker infrastructure
 *   failures (`HTTP 502/503/504` with `{ retryable: true }`, e.g. Chromium
 *   failed to launch before touching any employer page).
 * - Auth (`401`/`403`), payload (`400`), and non-retryable `502` responses are
 *   terminal and never fail over.
 * - B-186: a TIMEOUT is NEVER retryable. The worker may have already submitted
 *   the form; retrying risks a double submission. It surfaces as UNKNOWN for
 *   manual reconciliation.
 */
async function submitOnce(
  base: string,
  req: BrowserSubmitRequest,
  secret: string | undefined,
): Promise<ApplyOutcome | RetrySignal> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret) headers.authorization = `Bearer ${secret}`;
  try {
    const res = await fetch(`${base}/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      let body: { retryable?: boolean; error?: string; message?: string } | null = null;
      if (typeof (res as { json?: unknown }).json === 'function') {
        try {
          body = (await res.json()) as { retryable?: boolean; error?: string; message?: string };
        } catch {
          body = null;
        }
      }
      if ((res.status === 502 || res.status === 503 || res.status === 504) && body?.retryable === true) {
        return { retry: true, status: res.status, error: body.error };
      }
      return {
        outcome: 'STOP',
        code: 'POLICY_RESTRICTED',
        message: body?.error
          ? `The automatic-submission worker returned ${res.status} (${body.error}).`
          : `The automatic-submission worker returned ${res.status}.`,
      };
    }
    return (await res.json()) as ApplyOutcome;
  } catch (err) {
    const name = err instanceof DOMException ? err.name : (err as { name?: string } | null)?.name ?? '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return {
        outcome: 'UNKNOWN',
        code: 'SUBMIT_TIMEOUT',
        message:
          'The submission took too long and its result is unknown. It may or may not have gone through. Check the employer site before submitting again. Jobiest will not retry it automatically.',
      };
    }
    return { retry: true };
  }
}

export async function submitViaBrowser(req: BrowserSubmitRequest): Promise<ApplyOutcome> {
  const urls = workerUrls();
  if (urls.length === 0) {
    return {
      outcome: 'STOP',
      code: 'POLICY_RESTRICTED',
      message: 'The automatic-submission worker is not configured.',
    };
  }
  const secret = process.env.BROWSER_WORKER_SECRET;

  // Single worker: legacy behaviour (no health probe, one attempt).
  if (urls.length === 1) {
    const result = await submitOnce(urls[0], req, secret);
    if (isRetrySignal(result)) return retryExhaustedOutcome(result);
    return result;
  }

  // Failover mode: prefer a healthy worker (primary first), fall through on
  // network-level or pre-submit browser-launch failures. All workers down ⇒
  // safe STOP, never a retry storm. A TIMEOUT never fails over (B-186).
  const health = await Promise.all(urls.map(async (u) => ({ u, ok: await isHealthy(u) })));
  const ordered = [
    ...health.filter((h) => h.ok).map((h) => h.u),
    ...health.filter((h) => !h.ok).map((h) => h.u),
  ];
  let lastRetry: RetrySignal | null = null;
  for (const base of ordered) {
    const result = await submitOnce(base, req, secret);
    if (!isRetrySignal(result)) return result;
    lastRetry = result;
  }
  return retryExhaustedOutcome(lastRetry);
}
