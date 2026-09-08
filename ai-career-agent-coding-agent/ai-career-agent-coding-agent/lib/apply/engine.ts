import { assertSafeNavigation } from '@/lib/agent/ssrf';
import { messageForStop } from './stop-conditions';
import { readSignals } from './adapters/shared';
import { detectStopConditions } from './stop-conditions';
import type { ApplyCandidate, ApplyOutcome, ApplyPage, SiteApplyAdapter } from './types';

/**
 * Apply engine: orchestrates one controlled submission against an `ApplyPage`.
 * Pure of Playwright (the page is already bound by the caller), so it is
 * unit-testable with a fake page. SSRF is enforced here AND re-enforced by the
 * browser worker's per-request route guard.
 */

export interface EngineDeps {
  assertSafe?: (raw: string, allowed: string[]) => Promise<URL>;
}

export async function runApply(
  page: ApplyPage,
  candidate: ApplyCandidate,
  adapter: SiteApplyAdapter,
  deps: EngineDeps = {},
): Promise<ApplyOutcome> {
  const assertSafe = deps.assertSafe ?? assertSafeNavigation;

  // 1. SSRF: the job URL must be http(s) and inside the adapter's allowlist.
  const url = await assertSafe(candidate.jobUrl, adapter.domains);
  await page.goto(url.toString());

  // 2. Initial stop scan (CAPTCHA / anti-bot / auth / unsupported form).
  const stops = detectStopConditions(await readSignals(page));
  if (stops.length) return { outcome: 'STOP', code: stops[0], message: messageForStop(stops[0]) };

  // 3. Delegate to the site adapter (it re-checks before the final click).
  return adapter.apply(page, candidate);
}
