import { supabaseAdmin } from '@/lib/supabase';
import type { JobStore } from './ingest';
import type { NormalizedJob } from './types';

/** Production store: upserts on (source, external_id), idempotent ingestion.
 *  created_at is not part of the update set, so first-seen time is preserved. */
export const supabaseJobStore: JobStore = {
  async upsertJobs(jobs: NormalizedJob[]) {
    if (jobs.length === 0) return 0;
    const rows = jobs.map((j) => ({
      source: j.source,
      external_id: j.external_id,
      company: j.company,
      title: j.title,
      url: j.url,
      description: j.description,
      location: j.location,
      metadata: j.metadata,
    }));
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
