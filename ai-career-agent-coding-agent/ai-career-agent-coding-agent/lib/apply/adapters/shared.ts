import { detectStopConditions, messageForStop } from '../stop-conditions';
import type { ApplyCandidate, ApplyOutcome, ApplyPage, SiteApplyAdapter } from '../types';

/**
 * Shared helpers for site apply adapters. All selectors target the canonical,
 * documented Greenhouse/Lever application forms. They are best-effort and
 * fixture-tested: if a field is missing, the adapter STOPS with MISSING_INFO /
 * UNSUPPORTED_FORM rather than guessing. No data is ever invented.
 */

/** First selector that exists on the page, else null. */
export async function firstMatch(page: ApplyPage, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    if (await page.has(sel)) return sel;
  }
  return null;
}

/** Split a profile full name into first/last for the two-name fields. */
export function splitName(name: string | null): { first: string; last: string } {
  const parts = (name ?? '').trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.slice(1).join(' ');
  return { first, last };
}

/** Read the stop-condition signals for the current page state. */
export async function readSignals(page: ApplyPage) {
  const [html, hasPasswordField, hasFileInput, hasSubmitButton] = await Promise.all([
    page.content(),
    page.has('input[type="password"]'),
    page.has('input[type="file"]'),
    page.has('button[type="submit"], input[type="submit"]'),
  ]);
  return { html, url: page.url(), hasPasswordField, hasFileInput, hasSubmitButton };
}

/** Stop with the first detected condition, else null. */
export async function stopIfUnsafe(page: ApplyPage): Promise<ApplyOutcome | null> {
  const stops = detectStopConditions(await readSignals(page));
  if (stops.length) return { outcome: 'STOP', code: stops[0], message: messageForStop(stops[0]) };
  return null;
}
