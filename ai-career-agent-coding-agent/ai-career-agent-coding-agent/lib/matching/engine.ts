import type { AIGatewayRunOptions, AITask } from '@packages/ai/types';
import type {
  MatchableJob,
  MatchableProfile,
  MatchPreferences,
  MatchingOutcome,
  MatchOptions,
  JobMatch,
  MatchVerdict,
} from './types';
import { deterministicFilter } from './filters';
import { JOB_MATCH_TASK } from './task';

const DEFAULT_THRESHOLD = 60;
const DEFAULT_MAX_SCORED = 10;
const DEFAULT_CONCURRENCY = 3;

/**
 * Structural gateway dependency — the real `AIGateway` (packages/ai/gateway)
 * satisfies this, and tests inject a mock. Keeps the engine free of any
 * env/crypto/supabase import.
 */
export interface MatchingGateway {
  run<I, O>(
    task: AITask<I, O>,
    input: I,
    opts?: AIGatewayRunOptions,
  ): Promise<{ data: O; provider: string }>;
}

export interface RunMatchingInput {
  jobs: MatchableJob[];
  profile: MatchableProfile;
  prefs: MatchPreferences;
  appliedJobIds: ReadonlySet<string>;
  gateway: MatchingGateway;
  options?: MatchOptions;
}

export function verdictForScore(score: number): MatchVerdict {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'moderate';
  return 'weak';
}

/**
 * Phase 6 matching engine.
 *
 *  1. deterministic filter (applied-exclusion + preference rules) — no AI cost;
 *  2. batched AI scoring via the injected gateway, with per-job failure
 *     isolation (one bad job does not abort the batch);
 *  3. threshold + ranking into a shortlist.
 *
 * Pure given the injected gateway → fully unit-testable.
 */
export async function runMatching(input: RunMatchingInput): Promise<MatchingOutcome> {
  const threshold = input.options?.threshold ?? DEFAULT_THRESHOLD;
  const maxScored = input.options?.maxScored ?? DEFAULT_MAX_SCORED;
  const concurrency = Math.max(1, input.options?.concurrency ?? DEFAULT_CONCURRENCY);

  const { kept, excluded } = deterministicFilter(input.jobs, input.prefs, input.appliedJobIds);
  const toScore = kept.slice(0, maxScored);
  const cappedCount = Math.max(0, kept.length - toScore.length);

  const matches: JobMatch[] = [];
  const failures: { jobId: string; error: string }[] = [];

  await mapWithConcurrency(toScore, concurrency, async (job) => {
    try {
      const { data, provider } = await input.gateway.run(JOB_MATCH_TASK, {
        profile: input.profile,
        job,
      });
      matches.push({
        jobId: job.id,
        company: job.company,
        title: job.title,
        location: job.location,
        url: job.canonicalUrl,
        score: data.score,
        verdict: data.verdict,
        strengths: data.strengths,
        gaps: data.gaps,
        reasons: data.reasons,
        summary: data.summary,
        taskId: JOB_MATCH_TASK.id,
        taskVersion: JOB_MATCH_TASK.version,
        provider,
        matchedAt: new Date().toISOString(),
      });
    } catch (err) {
      failures.push({
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Threshold + rank. Jobs that scored but fell below threshold, and jobs that
  // failed, are intentionally not in the shortlist.
  const shortlist = matches.filter((m) => m.score >= threshold).sort((a, b) => b.score - a.score);

  return {
    matches: shortlist,
    excludedCount: excluded,
    cappedCount,
    scoredCount: toScore.length,
    failures,
  };
}

/** Run `fn` over `items` with at most `limit` in flight at a time. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
}
