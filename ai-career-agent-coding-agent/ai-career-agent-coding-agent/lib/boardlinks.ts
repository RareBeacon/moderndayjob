/**
 * Board deep links ("the employer's front door" strategy, owner decision
 * 2026-09-21 after the LinkedIn/Indeed research).
 *
 * LinkedIn and Indeed are discovery surfaces the USER browses themselves.
 * We never crawl, scrape, or automate them (both platforms' terms forbid it;
 * see research/linkedin-auto-apply-research). What we CAN do honestly is
 * build search URLs from the user's own saved preferences, so the boards and
 * the agent cover the same ground: the agent applies through employers' own
 * career sites, and these links let the user browse the boards directly.
 */

export interface BoardLinkPreferences {
  /** Target roles from the user's profile (profiles.target_roles). */
  targetRoles: string[];
  /** Preferred locations (job_preferences.locations). */
  locations: string[];
  /** True when every remote_types entry means "remote only". */
  remoteOnly: boolean;
}

export interface BoardLink {
  board: 'linkedin' | 'indeed';
  boardLabel: string;
  role: string;
  url: string;
}

/** Keep the dashboard tidy: at most this many roles × 2 boards. */
const MAX_ROLES = 3;
/** LinkedIn's documented "Remote" workplace-type filter value (f_WT=2). */
const LINKEDIN_REMOTE_FILTER = '2';
/** Indeed's documented "work from home" filter token (remotejob=...). */
const INDEED_REMOTE_TOKEN = '032b3046-06a3-4876-8dfd-474ebaf14158';

function cleanList(values: string[] | null | undefined): string[] {
  return (values ?? []).map((v) => v.trim()).filter(Boolean);
}

/** Remote-only when the user's remote_types contains only remote-ish values. */
export function isRemoteOnly(remoteTypes: string[] | null | undefined): boolean {
  const types = cleanList(remoteTypes);
  return types.length > 0 && types.every((t) => /remote/i.test(t));
}

export function buildBoardLinks(prefs: BoardLinkPreferences): BoardLink[] {
  const roles = cleanList(prefs.targetRoles).slice(0, MAX_ROLES);
  const location = cleanList(prefs.locations)[0] ?? '';
  const links: BoardLink[] = [];

  for (const role of roles) {
    const linkedin = new URL('https://www.linkedin.com/jobs/search/');
    linkedin.searchParams.set('keywords', role);
    if (location) linkedin.searchParams.set('location', location);
    if (prefs.remoteOnly) linkedin.searchParams.set('f_WT', LINKEDIN_REMOTE_FILTER);
    links.push({ board: 'linkedin', boardLabel: 'LinkedIn', role, url: linkedin.toString() });

    const indeed = new URL('https://www.indeed.com/jobs');
    indeed.searchParams.set('q', role);
    if (location) indeed.searchParams.set('l', location);
    indeed.searchParams.set('fromage', '7'); // postings from the last 7 days
    if (prefs.remoteOnly) indeed.searchParams.set('remotejob', INDEED_REMOTE_TOKEN);
    links.push({ board: 'indeed', boardLabel: 'Indeed', role, url: indeed.toString() });
  }

  return links;
}
