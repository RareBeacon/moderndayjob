import type { ApplyCandidate, ApplyOutcome } from './types';

/**
 * Browser-worker client. The web app and the agent worker NEVER launch a
 * browser themselves — they POST to the isolated browser worker (Render,
 * BROWSER_WORKER_URL). This keeps Playwright and unrestricted network egress
 * out of the Vercel/serverless runtime (SECURITY_ARCHITECTURE §Browser
 * automation: isolated Playwright browser worker).
 */

export interface BrowserSubmitRequest {
  jobUrl: string;
  allowedDomains: string[];
  candidate: ApplyCandidate;
}

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

/** Cheap /healthz probe: is this worker awake and reachable right now? */
async function isHealthy(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2_500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** One submission attempt. Returns 'RETRY' only for network-level failures
 *  (timeout / connection refused / DNS). Any HTTP response is authoritative:
 *  a 401/403 is an auth problem to surface, a 400 a payload problem — neither
 *  is fixed by trying another worker, so neither triggers failover. */
async function submitOnce(
  base: string,
  req: BrowserSubmitRequest,
  secret: string | undefined,
): Promise<ApplyOutcome | 'RETRY'> {
  // Shared secret with the worker (never reaches the browser — this module is
  // only imported server-side). Absent secret ⇒ the worker denies us, which
  // surfaces here as a safe STOP.
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
      return {
        outcome: 'STOP',
        code: 'POLICY_RESTRICTED',
        message: `The automatic-submission worker returned ${res.status}.`,
      };
    }
    return (await res.json()) as ApplyOutcome;
  } catch {
    return 'RETRY';
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
    if (result === 'RETRY') {
      return {
        outcome: 'STOP',
        code: 'POLICY_RESTRICTED',
        message: 'The automatic-submission worker is unreachable.',
      };
    }
    return result;
  }

  // Failover mode: prefer a healthy worker (primary first), fall through on
  // network-level failures. All workers down ⇒ safe STOP, never a retry storm.
  const health = await Promise.all(urls.map(async (u) => ({ u, ok: await isHealthy(u) })));
  const ordered = [
    ...health.filter((h) => h.ok).map((h) => h.u),
    ...health.filter((h) => !h.ok).map((h) => h.u),
  ];
  for (const base of ordered) {
    const result = await submitOnce(base, req, secret);
    if (result !== 'RETRY') return result;
  }
  return {
    outcome: 'STOP',
    code: 'POLICY_RESTRICTED',
    message: 'The automatic-submission worker is unreachable.',
  };
}
