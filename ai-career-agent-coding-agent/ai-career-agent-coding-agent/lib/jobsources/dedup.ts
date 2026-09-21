/**
 * Cross-source job dedup + freshness (Master Implementation Package
 * B-144/B-145, requirements 170-174).
 *
 * Two dedup tiers:
 *   Tier 1 (storage): unique(source, external_id), same-source re-ingestion
 *   is already idempotent (upsert).
 *   Tier 2 (query time): duplicate_key = sha256(normalized URL), the same
 *   listing served by two boards collapses to the EARLIEST row; duplicates
 *   are marked, never silently deleted (attribution stays intact).
 *
 * Freshness (B-145): rows not seen by ingestion within `staleDays` are
 * excluded from search/matching (the board no longer lists them).
 */

/** Normalize a job URL for comparison: scheme/host case, tracking params,
 *  trailing slash, common board host aliases. Deterministic, no network. */
export function normalizeJobUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    // Job boards commonly serve the same listing under /jobs/... and /job/...
    // with an id; keep the path but drop fragments and tracking params.
    const drop = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'src', 'ref', 'gh_src', 'lever-src']);
    const params = [...url.searchParams.entries()].filter(([k]) => !drop.has(k.toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}${qs}`;
  } catch {
    return null;
  }
}

/** Tier-2 duplicate key: normalized URL when present, else company+title. */
export function duplicateKey(job: { url?: string | null; company?: string | null; title?: string | null }): string | null {
  const norm = job.url ? normalizeJobUrl(job.url) : null;
  if (norm) return `u:${norm}`;
  const company = (job.company ?? '').trim().toLowerCase();
  const title = (job.title ?? '').trim().toLowerCase();
  if (company && title) return `t:${company}¦${title}`;
  return null;
}

export interface DedupableJob {
  id: string;
  duplicate_key?: string | null;
  created_at?: string | null;
}

/**
 * Mark tier-2 duplicates: for each duplicate_key keep the earliest row,
 * return the set of ids that are duplicates. Pure; unit-tested.
 */
export function findDuplicateIds<T extends DedupableJob>(jobs: T[]): Set<string> {
  const earliest = new Map<string, T>();
  for (const job of jobs) {
    const key = job.duplicate_key;
    if (!key) continue;
    const incumbent = earliest.get(key);
    if (!incumbent) {
      earliest.set(key, job);
      continue;
    }
    const a = job.created_at ?? '';
    const b = incumbent.created_at ?? '';
    if (a < b) earliest.set(key, job);
  }
  const keep = new Set(Array.from(earliest.values()).map((j) => j.id));
  return new Set(jobs.filter((j) => j.duplicate_key && !keep.has(j.id)).map((j) => j.id));
}

/** Filter a job list down to fresh, non-duplicate rows (query-time tier 2). */
export function dedupeAndFilterFresh<T extends DedupableJob>(
  jobs: T[],
  now: Date = new Date(),
  staleDays = 30,
): T[] {
  const cutoff = now.getTime() - staleDays * 24 * 3600 * 1000;
  const fresh = jobs.filter((j) => {
    const seen = j.created_at ?? ''; // last_seen_at fallback handled by caller
    if (!seen) return true;
    return new Date(seen).getTime() >= cutoff;
  });
  const dupes = findDuplicateIds(fresh);
  return fresh.filter((j) => !dupes.has(j.id));
}

/** Stale check for rows carrying last_seen_at. */
export function isStale(job: { last_seen_at?: string | null; created_at?: string | null }, now: Date = new Date(), staleDays = 30): boolean {
  const stamp = job.last_seen_at ?? job.created_at ?? null;
  if (!stamp) return false;
  return new Date(stamp).getTime() < now.getTime() - staleDays * 24 * 3600 * 1000;
}
