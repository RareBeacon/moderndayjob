import { dedupeJobs } from './normalize';
import type { AdapterContext, JobSourceAdapter } from './types';

export interface DiscoverySource {
  adapter: JobSourceAdapter;
  ctx: AdapterContext;
}
export interface DiscoveryError {
  source: string;
  message: string;
}
export interface DiscoveryOutcome {
  jobs: import('./types').NormalizedJob[];
  errors: DiscoveryError[];
}

/**
 * Runs all sources with failure isolation (ARCHITECTURE §13 / TECHNICAL_REQUIREMENTS §20):
 * one source throwing never prevents the others from returning jobs.
 * Pure, no database access. Use persistDiscoveredJobs() to store results.
 */
export async function runDiscovery(sources: DiscoverySource[]): Promise<DiscoveryOutcome> {
  const jobs: import('./types').NormalizedJob[] = [];
  const errors: DiscoveryError[] = [];

  await Promise.all(
    sources.map(async ({ adapter, ctx }) => {
      try {
        const found = await adapter.discover(ctx);
        jobs.push(...found);
      } catch (e) {
        errors.push({ source: adapter.source, message: e instanceof Error ? e.message : 'unknown error' });
      }
    }),
  );

  return { jobs: dedupeJobs(jobs), errors };
}
