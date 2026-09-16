import { supabaseAdmin } from '@/lib/supabase';
import type { JobStore } from './ingest';
import type { NormalizedJob } from './types';
import { duplicateKey } from './dedup';
import { contentHash } from './normalize';

/** Production store: upserts on (source, external_id), idempotent ingestion.
 *  created_at is not part of the update set, so first-seen time is preserved.
 *  Every re-ingestion bumps last_seen_at (B-145 freshness) and rewrites
 *  content_hash/duplicate_key (B-144 tier-2 dedup) in the same upsert. */
export const supabaseJobStore: JobStore = {
  async upsertJobs(jobs: NormalizedJob[]) {
    if (jobs.length === 0) return 0;
    const nowIso = new Date().toISOString();
    const rows = await Promise.all(
      jobs.map(async (j) => ({
        source: j.source,
        external_id: j.external_id,
        company: j.company,
        title: j.title,
        url: j.url,
        description: j.description,
        location: j.location,
        metadata: j.metadata,
        last_seen_at: nowIso,
        content_hash: await contentHash([j.company, j.title, j.location ?? '', j.description ?? '']),
        duplicate_key: duplicateKey(j),
      })),
    );
    // Chunk to keep payloads modest.
    let written = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { data, error } = await supabaseAdmin
        .from('jobs')
        .upsert(chunk, { onConflict: 'source,external_id' })
        .select('id');
      if (error) throw new Error(`JOB_UPSERT_FAILED: ${error.message}`);
      written += data?.length ?? chunk.length;
    }
    return written;
  },
};
