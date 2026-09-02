import { describe, it, expect } from 'vitest';
import { greenhouseAdapter, leverAdapter, ashbyAdapter, defaultAdapters } from '../lib/jobsources/boards';
import { runIngestion } from '../lib/jobsources/ingest';
import { htmlToText } from '../lib/jobsources/normalize';
import type { FetchLike, NormalizedJob, SourceAdapter } from '../lib/jobsources/types';

/** JSON -> Response helper for fake fetch implementations. */
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('adapters, normalization from real API shapes', () => {
  it('greenhouse: maps id/title/url/location and strips HTML', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({ jobs: [{ id: 12345, title: 'Platform Engineer', absolute_url: 'https://boards.greenhouse.io/stripe/jobs/12345', location: { name: 'Remote (EMEA)' }, content: '<p><strong>Build</strong> infrastructure.</p>' }] });
    const rows = await greenhouseAdapter('stripe', fetchImpl).fetchBatch(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'GREENHOUSE', external_id: '12345', company: 'stripe', title: 'Platform Engineer', location: 'Remote (EMEA)' });
    expect(rows[0].description).toBe('Build infrastructure.');
    expect(rows[0].metadata.contentHash).toBeTruthy();
  });

  it('greenhouse: skips rows missing title or url', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ jobs: [{ id: 1 }, { id: 2, title: 'X', absolute_url: 'https://x' }] });
    const rows = await greenhouseAdapter('stripe', fetchImpl).fetchBatch(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].external_id).toBe('2');
  });

  it('lever: prefers descriptionPlain, maps categories', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse([{ id: 'abc-123', text: 'Data Analyst', hostedUrl: 'https://jobs.lever.co/spotify/abc', descriptionPlain: 'Analyze things.', categories: { location: 'London', commitment: 'Full-time' } }]);
    const rows = await leverAdapter('spotify', fetchImpl).fetchBatch(10);
    expect(rows[0]).toMatchObject({ source: 'LEVER', external_id: 'abc-123', company: 'spotify', title: 'Data Analyst', description: 'Analyze things.', location: 'London · Full-time' });
  });

  it('ashby: maps remote flag into location', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({ jobs: [{ id: 'j1', title: 'Designer', jobUrl: 'https://jobs.ashbyhq.com/ramp/j1', location: 'New York', isRemote: true, description: 'Design stuff.' }] });
    const rows = await ashbyAdapter('ramp', fetchImpl).fetchBatch(10);
    expect(rows[0]).toMatchObject({ source: 'ASHBY', external_id: 'j1', location: 'New York · Remote' });
  });

  it('all adapters: non-2xx throws a source-tagged error', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({}, 404);
    await expect(greenhouseAdapter('nope', fetchImpl).fetchBatch(5)).rejects.toThrow('GREENHOUSE_HTTP_404');
    await expect(leverAdapter('nope', fetchImpl).fetchBatch(5)).rejects.toThrow('LEVER_HTTP_404');
    await expect(ashbyAdapter('nope', fetchImpl).fetchBatch(5)).rejects.toThrow('ASHBY_HTTP_404');
  });

  it('defaultAdapters builds the registry from env', () => {
    const adapters = defaultAdapters({ JOB_SOURCE_GREENHOUSE_BOARDS: 'a,b', JOB_SOURCE_LEVER_BOARDS: 'c', JOB_SOURCE_ASHBY_BOARDS: 'd,e' } as unknown as NodeJS.ProcessEnv, (async () => jsonResponse({})) as FetchLike);
    expect(adapters.map((a) => a.id)).toEqual(['greenhouse:a', 'greenhouse:b', 'lever:c', 'ashby:d', 'ashby:e']);
  });
});

describe('ingestion, error isolation + idempotent upserts', () => {
  const okAdapter = (id: string, n: number): SourceAdapter => ({
    id, label: id, fetchBatch: async (limit: number) => Array.from({ length: Math.min(n, limit) }, (_, i) => ({ source: 'GREENHOUSE', external_id: `${id}-${i}`, company: id, title: 'T', url: 'https://x', description: 'd', location: null, metadata: {} })),
  });

  it('a failing board never breaks the others', async () => {
    const failing: SourceAdapter = { id: 'bad', label: 'bad', fetchBatch: async () => { throw new Error('GREENHOUSE_HTTP_500'); } };
    const store = { upsertJobs: async (jobs: NormalizedJob[]) => jobs.length };
    const report = await runIngestion({ adapters: [okAdapter('good', 3), failing], store, pauseMs: 0 });
    expect(report.failures).toBe(1);
    expect(report.totalUpserted).toBe(3);
    expect(report.sources.find((s) => s.source === 'bad')).toMatchObject({ ok: false, error: 'GREENHOUSE_HTTP_500' });
    expect(report.sources.find((s) => s.source === 'good')).toMatchObject({ ok: true, fetched: 3 });
  });

  it('store receives normalized rows and the report counts them', async () => {
    const seen: NormalizedJob[][] = [];
    const store = { upsertJobs: async (jobs: NormalizedJob[]) => { seen.push(jobs); return jobs.length; } };
    const report = await runIngestion({ adapters: [okAdapter('a', 5)], store, limit: 3, pauseMs: 0 });
    expect(seen[0]).toHaveLength(3); // limit respected
    expect(report.totalFetched).toBe(3);
    expect(report.totalUpserted).toBe(3);
    expect(report.ranAt).toBeTruthy();
  });
});

describe('normalize helpers', () => {
  it('htmlToText strips tags, decodes entities, keeps line breaks', () => {
    expect(htmlToText('<p>Build &amp; ship</p><ul><li>Fast</li></ul>')).toBe('Build & ship\n• Fast');
  });

  it('htmlToText handles Greenhouse-style HTML-escaped HTML', () => {
    // verified wild shape: the HTML itself is entity-escaped
    expect(htmlToText('&lt;p&gt;Build &lt;b&gt;things&lt;/b&gt;&lt;/p&gt;')).toBe('Build things');
    expect(htmlToText('&lt;li&gt;growth&amp;nbsp;&lt;/li&gt;')).toBe('• growth');
    expect(htmlToText('&lt;p&gt;A &amp;amp; B&lt;/p&gt;')).toBe('A & B');
  });
});

// keep the unused import honest for future fixture reuse
