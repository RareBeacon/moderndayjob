import type { NormalizedJob, SourceAdapter, SourceReport } from './types';

/** Narrow storage port so ingestion is unit-testable without a database. */
export interface JobStore {
  /** Upsert rows on (source, external_id); returns the row count written. */
  upsertJobs(jobs: NormalizedJob[]): Promise<number>;
}

export interface IngestOptions {
  adapters: SourceAdapter[];
  store: JobStore;
  /** Max postings per board per run (default 50). */
  limit?: number;
  /** Delay between boards to stay rate-limit friendly (default 250ms). */
  pauseMs?: number;
}

export interface IngestReport {
  ranAt: string;
  sources: SourceReport[];
  totalFetched: number;
  totalUpserted: number;
  failures: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run all source adapters with error isolation: a failing board is recorded
 * in the report and the remaining boards still run. Rows are upserted on
 * (source, external_id) so re-running is idempotent — created_at of an
 * existing row is never touched, so "new in your pool" stays truthful.
 */
export async function runIngestion(options: IngestOptions): Promise<IngestReport> {
  const limit = options.limit ?? 50;
  const pauseMs = options.pauseMs ?? 250;
  const sources: SourceReport[] = [];

  for (const adapter of options.adapters) {
    try {
      const rows = await adapter.fetchBatch(limit);
      const upserted = rows.length > 0 ? await options.store.upsertJobs(rows) : 0;
      sources.push({ source: adapter.id, fetched: rows.length, upserted, ok: true });
    } catch (err) {
      sources.push({
        source: adapter.id,
        fetched: 0,
        upserted: 0,
        ok: false,
        error: err instanceof Error ? err.message : 'UNKNOWN',
      });
    }
    if (pauseMs > 0) await sleep(pauseMs);
  }

  return {
    ranAt: new Date().toISOString(),
    sources,
    totalFetched: sources.reduce((n, s) => n + s.fetched, 0),
    totalUpserted: sources.reduce((n, s) => n + s.upserted, 0),
    failures: sources.filter((s) => !s.ok).length,
  };
}
