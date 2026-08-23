import { describe, it, expect } from 'vitest';
import type { AITask } from '../packages/ai/types';
import type { MatchableJob, MatchableProfile, MatchPreferences } from '../lib/matching/types';
import { deterministicFilter } from '../lib/matching/filters';
import { runMatching, verdictForScore, type MatchingGateway } from '../lib/matching/engine';
import { JOB_MATCH_TASK } from '../lib/matching/task';

/* ---------- helpers ---------- */

function job(over: Partial<MatchableJob> & { id: string }): MatchableJob {
  return {
    source: 'greenhouse',
    externalId: over.id,
    company: 'Acme',
    title: 'Engineer',
    description: 'Build things.',
    location: 'Lagos, NG',
    remoteType: 'unknown',
    employmentType: 'unknown',
    ...over,
  };
}

const profile: MatchableProfile = {
  headline: 'Engineer',
  summary: 'I build things.',
  skills: ['typescript'],
  targetRoles: ['Software Engineer'],
  experience: [{ company: 'Acme', title: 'Engineer' }],
};

function mockGateway(scores: Record<string, number>, failIds: string[] = []): MatchingGateway {
  return {
    async run<I, O>(_task: AITask<I, O>, input: I): Promise<{ data: O; provider: string }> {
      const j = (input as { job: MatchableJob }).job;
      if (failIds.includes(j.id)) throw new Error('AI_ALL_PROVIDERS_FAILED');
      const score = scores[j.id] ?? 50;
      return {
        data: {
          score,
          verdict: verdictForScore(score),
          strengths: ['matched skill'],
          gaps: [],
          reasons: ['profile fits'],
          summary: 'A reasonable fit for the role.',
        } as unknown as O,
        provider: 'mock',
      };
    },
  };
}

/* ---------- deterministic filter ---------- */

describe('deterministicFilter', () => {
  it('excludes already-applied jobs', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' }), job({ id: 'c' })];
    const { kept, excluded } = deterministicFilter(jobs, {}, new Set(['b']));
    expect(kept.map((j) => j.id)).toEqual(['a', 'c']);
    expect(excluded).toBe(1);
  });

  it('filters by remote preference but keeps unknowns', () => {
    const jobs = [
      job({ id: 'a', remoteType: 'remote' }),
      job({ id: 'b', remoteType: 'onsite' }),
      job({ id: 'c', remoteType: 'unknown' }),
    ];
    const { kept } = deterministicFilter(jobs, { remoteTypes: ['remote'] }, new Set());
    expect(kept.map((j) => j.id)).toEqual(['a', 'c']);
  });

  it('filters by employment-type preference', () => {
    const jobs = [
      job({ id: 'a', employmentType: 'full-time' }),
      job({ id: 'b', employmentType: 'contract' }),
    ];
    const { kept } = deterministicFilter(jobs, { employmentTypes: ['full-time'] }, new Set());
    expect(kept.map((j) => j.id)).toEqual(['a']);
  });

  it('filters by location preference but keeps flexible locations', () => {
    const jobs = [
      job({ id: 'a', location: 'Lagos, NG' }),
      job({ id: 'b', location: 'Nairobi, KE' }),
      job({ id: 'c', location: 'Remote' }),
      job({ id: 'd', location: '' }),
    ];
    const { kept } = deterministicFilter(jobs, { locations: ['lagos'] }, new Set());
    expect(kept.map((j) => j.id)).toEqual(['a', 'c', 'd']);
  });

  it('filters by seniority only when the job states one', () => {
    const jobs = [
      job({ id: 'a', seniority: 'senior' }),
      job({ id: 'b', seniority: 'junior' }),
      job({ id: 'c' /* no seniority */ }),
    ];
    const { kept } = deterministicFilter(jobs, { seniority: ['senior'] }, new Set());
    expect(kept.map((j) => j.id)).toEqual(['a', 'c']);
  });

  it('keeps everything when no preferences are set', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' })];
    const { kept, excluded } = deterministicFilter(jobs, {}, new Set());
    expect(kept.length).toBe(2);
    expect(excluded).toBe(0);
  });
});

/* ---------- engine ---------- */

describe('runMatching', () => {
  const prefs: MatchPreferences = {};

  it('scores, thresholds, and ranks matches with display fields', async () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' }), job({ id: 'c' })];
    const out = await runMatching({
      jobs,
      profile,
      prefs,
      appliedJobIds: new Set(),
      gateway: mockGateway({ a: 80, b: 50, c: 72 }),
      options: { threshold: 60 },
    });
    // 50 is below threshold → excluded from shortlist; ranked desc.
    expect(out.matches.map((m) => m.jobId)).toEqual(['a', 'c']);
    expect(out.matches[0].score).toBe(80);
    expect(out.matches[0]).toMatchObject({ company: 'Acme', title: 'Engineer' });
    expect(out.matches[0]).toMatchObject({ taskId: 'job_match', taskVersion: 1, provider: 'mock' });
    expect(out.scoredCount).toBe(3);
    expect(out.failures).toHaveLength(0);
  });

  it('excludes already-applied jobs before scoring', async () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' })];
    const out = await runMatching({
      jobs,
      profile,
      prefs,
      appliedJobIds: new Set(['a']),
      gateway: mockGateway({ a: 99, b: 70 }),
    });
    expect(out.matches.map((m) => m.jobId)).toEqual(['b']);
    expect(out.excludedCount).toBe(1);
    expect(out.scoredCount).toBe(1);
  });

  it('isolates per-job AI failures without aborting the batch', async () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' }), job({ id: 'c' })];
    const out = await runMatching({
      jobs,
      profile,
      prefs,
      appliedJobIds: new Set(),
      gateway: mockGateway({ a: 80, b: 70, c: 60 }, ['b']),
    });
    expect(out.matches.map((m) => m.jobId).sort()).toEqual(['a', 'c']);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0].jobId).toBe('b');
  });

  it('caps the number of scored jobs and reports cappedCount', async () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' }), job({ id: 'c' }), job({ id: 'd' })];
    const out = await runMatching({
      jobs,
      profile,
      prefs,
      appliedJobIds: new Set(),
      gateway: mockGateway({ a: 90, b: 90, c: 90, d: 90 }),
      options: { maxScored: 2 },
    });
    expect(out.scoredCount).toBe(2);
    expect(out.cappedCount).toBe(2);
  });

  it('produces explainable output (strengths/gaps/reasons/summary)', async () => {
    const out = await runMatching({
      jobs: [job({ id: 'a' })],
      profile,
      prefs,
      appliedJobIds: new Set(),
      gateway: mockGateway({ a: 85 }),
    });
    const m = out.matches[0];
    expect(m.strengths.length).toBeGreaterThan(0);
    expect(m.reasons.length).toBeGreaterThan(0);
    expect(m.summary.length).toBeGreaterThan(0);
    expect(verdictForScore(85)).toBe('strong');
  });
});
