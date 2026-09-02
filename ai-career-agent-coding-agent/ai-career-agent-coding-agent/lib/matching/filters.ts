import type { RemoteType } from '@/lib/jobs/types';
import type { MatchableJob, MatchPreferences } from './types';

const REMOTE_ALIASES: Record<string, RemoteType> = {
  remote: 'remote',
  fully_remote: 'remote',
  'fully-remote': 'remote',
  anywhere: 'remote',
  hybrid: 'hybrid',
  onsite: 'onsite',
  on_site: 'onsite',
  'on-site': 'onsite',
  office: 'onsite',
  in_person: 'onsite',
};

function normRemote(s: string): RemoteType | undefined {
  return REMOTE_ALIASES[s.trim().toLowerCase().replace(/\s+/g, '_')];
}

/**
 * Deterministic, rule-based pre-filter (Phase 6). Removes jobs that are
 * structurally ineligible BEFORE any AI cost is incurred:
 *   - already applied to (Phase 6 acceptance: "previously applied excluded");
 *   - remote / employment-type / location / seniority mismatch when the user
 *     expressed a preference. Unknown/undetermined values are always kept,
 *     the filter never over-rejects when it cannot tell.
 *
 * Pure + side-effect free → unit-testable.
 *
 * Note: `appliedJobIds` are jobs.id (uuid) values; MatchableJob carries that id.
 */
export function deterministicFilter(
  jobs: MatchableJob[],
  prefs: MatchPreferences,
  appliedJobIds: ReadonlySet<string>,
): { kept: MatchableJob[]; excluded: number } {
  const kept: MatchableJob[] = [];
  let excluded = 0;

  const remotePrefs = (prefs.remoteTypes ?? [])
    .map(normRemote)
    .filter((r): r is RemoteType => Boolean(r));
  const empPrefs = (prefs.employmentTypes ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const locPrefs = (prefs.locations ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const senPrefs = (prefs.seniority ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const job of jobs) {
    // 1) Already applied → always exclude.
    if (appliedJobIds.has(job.id)) {
      excluded++;
      continue;
    }

    // 2) Remote preference (unknown passes).
    if (
      remotePrefs.length &&
      job.remoteType !== 'unknown' &&
      !remotePrefs.includes(job.remoteType)
    ) {
      excluded++;
      continue;
    }

    // 3) Employment-type preference (unknown passes).
    if (
      empPrefs.length &&
      job.employmentType !== 'unknown' &&
      !empPrefs.includes(job.employmentType)
    ) {
      excluded++;
      continue;
    }

    // 4) Location preference: keep if location is empty/remote/unknown or
    //    matches any preferred location substring.
    if (locPrefs.length) {
      const loc = (job.location ?? '').trim().toLowerCase();
      const isFlexible = !loc || loc.includes('remote') || loc === 'unknown';
      const matches = locPrefs.some((p) => loc.includes(p));
      if (!isFlexible && !matches) {
        excluded++;
        continue;
      }
    }

    // 5) Seniority preference: only filter when the job states one explicitly.
    if (senPrefs.length && job.seniority) {
      const s = job.seniority.trim().toLowerCase();
      if (!senPrefs.some((p) => s.includes(p))) {
        excluded++;
        continue;
      }
    }

    kept.push(job);
  }

  return { kept, excluded };
}
