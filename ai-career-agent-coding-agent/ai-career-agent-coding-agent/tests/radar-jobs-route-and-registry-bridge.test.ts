import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  return {
    authedUser: null as { id: string; email: string } | null,
    notCalls: [] as Array<[string, string, string]>,
    sourceRows: [] as Record<string, unknown>[],
    jobRows: [] as Record<string, unknown>[],
  };
});

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(async () => {
    if (!m.authedUser) throw new Error('UNAUTHENTICATED');
    return m.authedUser;
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIp: vi.fn(() => '203.0.113.10'),
}));

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      not: (col: string, op: string, val: string) => {
        m.notCalls.push([col, op, val]);
        return chain;
      },
      or: () => chain,
      ilike: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      range: async () => ({
        data: m.jobRows,
        count: m.jobRows.length,
        error: null,
      }),
      then: (res: (v: unknown) => void) => {
        if (table === 'job_sources') return res({ data: m.sourceRows, error: null });
        if (table === 'saved_jobs') return res({ data: [{ job_id: 'job-shared-1' }], error: null });
        return res({ data: [], error: null });
      },
    };
    return chain;
  };
  return { supabaseAdmin: { from } };
});

import { GET as getJobsRoute } from '@/app/api/jobs/route';
import { loadRegistryAdapters } from '@/lib/jobsources/registry';
import { ashbyAdapter } from '@/lib/jobsources/boards';

beforeEach(() => {
  m.authedUser = null;
  m.notCalls.length = 0;
  m.sourceRows = [];
  m.jobRows = [];
});

describe('GET /api/jobs security & isolation boundary (Condition 4)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await getJobsRoute(new Request('https://jobiest.com/api/jobs'));
    expect(res.status).toBe(401);
  });

  it('excludes private MANUAL and DISCOVERED rows and strips internal metadata keys', async () => {
    m.authedUser = { id: 'user-123', email: 'candidate@example.com' };
    m.jobRows = [
      {
        id: 'job-shared-1',
        source: 'GREENHOUSE',
        external_id: '700101',
        company: 'Stripe',
        title: 'Backend Engineer',
        url: 'https://boards.greenhouse.io/stripe/jobs/700101',
        description: 'Build distributed systems.',
        location: 'Dublin, Ireland',
        metadata: {
          boardToken: 'stripe',
          originUser: 'secret-other-user-uuid',
          leaseToken: 'internal-lease-secret',
          rawPayloadHash: 'abc123hash',
        },
        created_at: '2026-11-01T00:00:00Z',
      },
    ];

    const res = await getJobsRoute(new Request('https://jobiest.com/api/jobs?q=Backend'));
    expect(res.status).toBe(200);
    expect(m.notCalls).toEqual([['source', 'in', '("MANUAL","DISCOVERED")']]);

    const body = (await res.json()) as { jobs: Array<{ metadata: Record<string, unknown>; isSaved: boolean }> };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].isSaved).toBe(true);
    expect(body.jobs[0].metadata).toEqual({ boardToken: 'stripe' });
    expect(body.jobs[0].metadata).not.toHaveProperty('originUser');
    expect(body.jobs[0].metadata).not.toHaveProperty('leaseToken');
    expect(body.jobs[0].metadata).not.toHaveProperty('rawPayloadHash');
  });
});

describe('loadRegistryAdapters Phase 2 expansion & Condition 1 filtering', () => {
  const noopFetch = (async () => new Response('{}')) as unknown as typeof fetch;

  it('loads all new Phase 2 ATS adapters while filtering out prohibited, restricted, non-commercial, and robots-disallowed rows', async () => {
    m.sourceRows = [
      { id: 'lever_eu:klarna', adapter: 'lever_eu', board: 'klarna', enabled: true, consecutive_failures: 0 },
      { id: 'recruitee:nord', adapter: 'recruitee', board: 'nord', enabled: true, consecutive_failures: 0 },
      { id: 'personio:celonis', adapter: 'personio', board: 'celonis', enabled: true, consecutive_failures: 0 },
      { id: 'pinpoint:health', adapter: 'pinpoint', board: 'health', enabled: true, consecutive_failures: 0 },
      { id: 'gem:cohere', adapter: 'gem', board: 'cohere', enabled: true, consecutive_failures: 0 },
      { id: 'polymer:acme', adapter: 'polymer', board: 'acme', enabled: true, consecutive_failures: 0 },
      { id: 'breezy:pay', adapter: 'breezy', board: 'pay', enabled: true, consecutive_failures: 0 },
      { id: 'teamtailor:sana', adapter: 'teamtailor', board: 'sana', enabled: true, consecutive_failures: 0 },
      // Filtered out by Condition 1 gates:
      {
        id: 'smartrecruiters:bosch',
        adapter: 'smartrecruiters',
        board: 'bosch',
        enabled: true,
        collection_permission: 'RESTRICTED_PENDING_REVIEW',
        consecutive_failures: 0,
      },
      {
        id: 'greenhouse:no-commercial',
        adapter: 'greenhouse',
        board: 'no-commercial',
        enabled: true,
        commercial_indexing_allowed: false,
        consecutive_failures: 0,
      },
      {
        id: 'ashby:robots-blocked',
        adapter: 'ashby',
        board: 'robots-blocked',
        enabled: true,
        robots_status: 'DISALLOWED',
        consecutive_failures: 0,
      },
    ];

    const adapters = await loadRegistryAdapters(noopFetch, () => []);
    expect(adapters.map((a) => a.id)).toEqual([
      'lever_eu:klarna',
      'recruitee:nord',
      'personio:celonis',
      'pinpoint:health',
      'gem:cohere',
      'polymer:acme',
      'breezy:pay',
      'teamtailor:sana',
    ]);
  });

  it('ashbyAdapter formats Hybrid workplaceType accurately even when isRemote=true', async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 'hybrid-1',
              title: 'Systems Engineer',
              jobUrl: 'https://jobs.ashbyhq.com/linear/hybrid-1',
              location: 'San Francisco',
              workplaceType: 'Hybrid',
              isRemote: true,
              description: '<p>Build fast systems.</p>',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const rows = await ashbyAdapter('linear', fakeFetch).fetchBatch(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].location).toBe('San Francisco · Hybrid');
  });
});
