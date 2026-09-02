import { supabaseAdmin } from '@/lib/supabase';
import type { NormalizedJob } from './types';

/**
 * Upserts discovered jobs into the shared jobs pool. Idempotent on (source, external_id)
 * (TECHNICAL_REQUIREMENTS §7, §14). Server/worker-only, uses the service role.
 */
export async function persistDiscoveredJobs(jobs: NormalizedJob[]): Promise<{ written: number }> {
  if (jobs.length === 0) return { written: 0 };

  const rows = jobs.map((j) => ({
    source: j.source,
    external_id: j.source_job_id,
    company: j.company,
    title: j.title,
    url: j.canonical_url,
    description: j.description.slice(0, 5000),
    location: j.location,
    metadata: {
      remote_type: j.remote_type,
      employment_type: j.employment_type,
      seniority: j.seniority ?? null,
      salary: j.salary ?? null,
      posted_at: j.posted_at ?? null,
      application_url: j.application_url ?? null,
      content_hash: j.content_hash,
    },
  }));

  const { error } = await supabaseAdmin
    .from('jobs')
    .upsert(rows, { onConflict: 'source,external_id' });
  if (error) throw new Error(`JOBS_PERSIST_FAILED: ${error.message}`);
  return { written: rows.length };
}
