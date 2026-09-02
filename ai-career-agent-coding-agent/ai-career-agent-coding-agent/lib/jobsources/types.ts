/** Job source adapter contracts.
 *
 * A source adapter fetches postings from ONE public job board endpoint and
 * normalizes them into the canonical jobs-table shape. Adapters are:
 * - Injectable: they receive a `fetchImpl` so tests never hit live APIs.
 * - Isolated: one adapter failing must never break another (ingest.ts).
 * - Honest: they only map fields the source actually provides; nothing is
 *   inferred or fabricated. Listing text is UNTRUSTED data end-to-end,
 *   stored as data and always framed as untrusted in downstream AI prompts.
 */

/** Canonical job row shape (maps 1:1 to the public.jobs table). */
export interface NormalizedJob {
  source: 'GREENHOUSE' | 'LEVER' | 'ASHBY';
  external_id: string;
  company: string;
  title: string;
  url: string;
  description: string;
  location: string | null;
  metadata: Record<string, unknown>;
}

export interface SourceAdapter {
  /** Stable source id, e.g. 'greenhouse:stripe'. */
  id: string;
  /** Human label for reports. */
  label: string;
  /** Fetch + normalize up to `limit` postings. Throws on transport/HTTP error. */
  fetchBatch(limit: number): Promise<NormalizedJob[]>;
}

export interface FetchJson {
  (url: string, init?: RequestInit): Promise<unknown>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Default: global fetch with a hard 10s timeout (rate-limit friendly: no retries). */
export function defaultFetchImpl(): FetchLike {
  return (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}

/** Per-source ingestion report (error isolation: failures are data, not crashes). */
export interface SourceReport {
  source: string;
  fetched: number;
  upserted: number;
  ok: boolean;
  error?: string;
}
