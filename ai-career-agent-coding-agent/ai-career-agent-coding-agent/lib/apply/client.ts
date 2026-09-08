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

export async function submitViaBrowser(req: BrowserSubmitRequest): Promise<ApplyOutcome> {
  const base = process.env.BROWSER_WORKER_URL;
  if (!base) {
    return {
      outcome: 'STOP',
      code: 'POLICY_RESTRICTED',
      message: 'The automatic-submission worker is not configured.',
    };
  }
  try {
    // Shared secret with the worker (never reaches the browser — this module
    // is only imported server-side). Absent secret ⇒ the worker denies us,
    // which surfaces here as a safe STOP.
    const secret = process.env.BROWSER_WORKER_SECRET;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secret) headers.authorization = `Bearer ${secret}`;
    const res = await fetch(`${base.replace(/\/+$/, '')}/submit`, {
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
    return {
      outcome: 'STOP',
      code: 'POLICY_RESTRICTED',
      message: 'The automatic-submission worker is unreachable.',
    };
  }
}
