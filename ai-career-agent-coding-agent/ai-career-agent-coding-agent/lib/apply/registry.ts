import { greenhouseApplyAdapter } from './adapters/greenhouse';
import { leverApplyAdapter } from './adapters/lever';
import type { SiteApplyAdapter } from './types';

/**
 * Registry of supported site apply adapters. A job URL must map to one of
 * these before automatic submission is even considered (UNSUPPORTED_PLATFORM
 * otherwise). Extending support = adding an adapter here.
 */

export const applyAdapters: SiteApplyAdapter[] = [greenhouseApplyAdapter, leverApplyAdapter];

/** Find the adapter whose domain allowlist covers this job URL, else null. */
export function detectApplyAdapter(rawUrl: string): SiteApplyAdapter | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  return applyAdapters.find((a) => a.matches(url)) ?? null;
}
