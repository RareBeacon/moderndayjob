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
 * Structural gateway dependency, the real `AIGateway` (packages/ai/gateway)
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
  gateway?: MatchingGateway;
  deterministicOnly?: boolean;
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
 *  1. deterministic filter (applied-exclusion + preference rules), no AI cost;
 *  2. deterministic scoring in safe mode, or batched AI scoring via an
 *     injected gateway when explicitly requested by tests/internal callers;
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
      if (input.deterministicOnly || !input.gateway) {
        matches.push(matchFromResult(job, deterministicMatch(input.profile, job), SAFE_MATCH_PROVIDER));
        return;
      }
      const { data, provider } = await input.gateway.run(JOB_MATCH_TASK, {
        profile: input.profile,
        job,
      });
      matches.push(matchFromResult(job, data, provider));
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


const SAFE_MATCH_PROVIDER = 'jobiest_safe_matcher';

function matchFromResult(job: MatchableJob, data: import('./types').MatchResult, provider: string): JobMatch {
  return {
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
  };
}

function deterministicMatch(profile: MatchableProfile, job: MatchableJob): import('./types').MatchResult {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const profileSkills = (profile.skills ?? []).map((s) => s.trim()).filter(Boolean);
  const matchedSkills = profileSkills.filter((s) => {
    const n = s.toLowerCase();
    return n.length >= 2 && jobText.includes(n);
  });
  const targetRoles = (profile.targetRoles ?? []).map((r) => r.trim()).filter(Boolean);
  const roleHit = targetRoles.some((r) => job.title.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(job.title.toLowerCase()));
  const skillScore = profileSkills.length ? Math.round((matchedSkills.length / profileSkills.length) * 45) : 0;
  const roleScore = roleHit ? 25 : 0;
  const base = matchedSkills.length || roleHit ? 35 : 25;
  const score = Math.max(0, Math.min(100, base + skillScore + roleScore));
  const strengths = matchedSkills.length
    ? matchedSkills.slice(0, 6).map((s) => `Profile skill appears in listing: ${s}`)
    : ['Deterministic scan completed against your saved profile.'];
  const gaps = matchedSkills.length < Math.min(profileSkills.length, 3)
    ? ['Some saved profile skills were not found directly in the listing text.']
    : [];
  const reasons = [
    roleHit ? 'Saved target role aligns with the job title.' : 'No direct target-role title match was found.',
    matchedSkills.length ? `${matchedSkills.length} saved skill(s) appear in the job text.` : 'No saved skills were found directly in the job text.',
  ];
  return {
    score,
    verdict: verdictForScore(score),
    strengths,
    gaps,
    reasons,
    summary: `Deterministic match score based on saved skills and target-role overlap for ${job.title || 'this job'}.`,
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
