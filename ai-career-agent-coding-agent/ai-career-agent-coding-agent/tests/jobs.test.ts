import { describe, it, expect } from 'vitest';
import { greenhouseAdapter } from '../lib/jobs/adapters/greenhouse';
import { leverAdapter } from '../lib/jobs/adapters/lever';
import { runDiscovery } from '../lib/jobs/discover';
import { contentHash, dedupeJobs, inferRemoteType, stripHtml } from '../lib/jobs/normalize';
import type { AdapterContext, JobFetcher } from '../lib/jobs/types';

function mockFetcher(response: unknown, status = 200): JobFetcher {
  return async () => new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } });
}
const ctx = (fetcher: JobFetcher): AdapterContext => ({ fetcher, board: 'acme', company: 'Acme Inc' });

describe('greenhouse adapter', () => {
  it('normalizes Greenhouse jobs to the canonical model', async () => {
    const payload = {
      jobs: [
        { id: 101, title: 'Senior Product Designer', absolute_url: 'https://boards.greenhouse.io/acme/jobs/101', location: { name: 'Remote' }, content: '<p>Design <strong>great</strong> products.</p>', updated_at: '2026-01-02T00:00:00Z', departments: [{ name: 'Design' }] },
        { id: 102, title: 'Onsite Engineer', absolute_url: 'https://boards.greenhouse.io/acme/jobs/102', location: { name: 'Lagos, Nigeria' }, content: 'Onsite role', updated_at: '2026-01-03T00:00:00Z' },
      ],
    };
    const jobs = await greenhouseAdapter.discover(ctx(mockFetcher(payload)));
    expect(jobs).toHaveLength(2);
    expect(jobs[0].source).toBe('greenhouse');
    expect(jobs[0].source_job_id).toBe('101');
    expect(jobs[0].company).toBe('Acme Inc');
    expect(jobs[0].description).toBe('Design great products.');
    expect(jobs[0].remote_type).toBe('remote');
    expect(jobs[1].remote_type).toBe('onsite');
    expect(jobs[0].content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an invalid board token (SSRF guard)', async () => {
    await expect(greenhouseAdapter.discover({ ...ctx(mockFetcher({})), board: 'evil/../x' })).rejects.toThrow();
  });
});

describe('lever adapter', () => {
  it('normalizes Lever postings', async () => {
    const payload = [
      { id: 'abc', text: 'AI Engineer', descriptionPlain: 'Build LLM apps.', hostedUrl: 'https://jobs.lever.co/acme/abc', applyUrl: 'https://jobs.lever.co/acme/abc/apply', createdAt: 1700000000000, categories: { location: 'Remote (Global)', commitment: 'Full-time', level: 'Senior', team: 'Eng' } },
    ];
    const jobs = await leverAdapter.discover(ctx(mockFetcher(payload)));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('AI Engineer');
    expect(jobs[0].employment_type).toBe('full-time');
    expect(jobs[0].seniority).toBe('Senior');
    expect(jobs[0].remote_type).toBe('remote');
    expect(jobs[0].posted_at).toBe(new Date(1700000000000).toISOString());
  });
});

describe('normalization helpers', () => {
  it('strips HTML and collapses whitespace', () => {
    expect(stripHtml('<p>Hello&nbsp;<b>world</b></p>')).toBe('Hello world');
  });
  it('infers remote types', () => {
    expect(inferRemoteType('Remote', '')).toBe('remote');
    expect(inferRemoteType('', 'hybrid role')).toBe('hybrid');
    expect(inferRemoteType('Berlin', '')).toBe('unknown');
  });
  it('produces a deterministic, case-insensitive content hash', () => {
    const a = contentHash({ source: 'greenhouse', source_job_id: '1', company: 'Acme', title: 'Dev', description: 'x' });
    const b = contentHash({ source: 'greenhouse', source_job_id: '1', company: 'acme', title: 'Dev', description: 'x' });
    expect(a).toBe(b);
  });
});

describe('dedupeJobs', () => {
  const base = { source: 'greenhouse', source_job_id: '1', canonical_url: 'u', company: 'Acme', title: 'Dev', description: 'x', location: '', remote_type: 'unknown' as const, employment_type: 'unknown' as const, metadata: {}, content_hash: 'h1' };
  it('removes duplicates by key and by content hash', () => {
    const dupKey = { ...base };
    const dupHash = { ...base, source_job_id: '2', content_hash: 'h1' };
    expect(dedupeJobs([base, dupKey, dupHash])).toHaveLength(1);
  });
  it('keeps distinct jobs', () => {
    const other = { ...base, source_job_id: '2', content_hash: 'h2', title: 'Other' };
    expect(dedupeJobs([base, other])).toHaveLength(2);
  });
});

describe('runDiscovery failure isolation', () => {
  it('continues when one source throws and records the error', async () => {
    const goodFetcher = mockFetcher({ jobs: [{ id: 1, title: 'A', absolute_url: 'u', location: { name: 'Remote' }, content: 'c', updated_at: '2026-01-01T00:00:00Z' }] });
    const badFetcher: JobFetcher = async () => {
      throw new Error('network down');
    };
    const out = await runDiscovery([
      { adapter: greenhouseAdapter, ctx: ctx(goodFetcher) },
      { adapter: leverAdapter, ctx: ctx(badFetcher) },
    ]);
    expect(out.jobs).toHaveLength(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].source).toBe('lever');
  });
});
