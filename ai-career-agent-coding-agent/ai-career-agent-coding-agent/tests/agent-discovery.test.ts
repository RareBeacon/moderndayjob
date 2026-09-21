import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Per-user job discovery (owner decision 2026-09-21). The agent reads the
 * user's preferences, matches them against the public job boards in the
 * registry, and adds matching roles to the user's pipeline. These tests pin:
 * the pure matching rules (role fuzz, location/remote, submittable URL), the
 * plan/eligibility gates, dedupe against pasted links, per-plan metering,
 * the auto send policy enqueue, and the notification behaviour.
 */

const m = vi.hoisted(() => {
  const state: Record<string, unknown> = {};
  const calls = {
    fetchedUrls: [] as string[],
    insertedJobs: [] as Record<string, unknown>[],
    insertedTasks: [] as Record<string, unknown>[],
    appUpdates: [] as Record<string, unknown>[],
    events: [] as Array<{ applicationId: string; event: string }>,
    persisted: [] as Array<{ kind: string; applicationId: string | undefined }>,
    meterWrites: [] as Array<{ table: string; values: Record<string, unknown> }>,
    foundEmails: 0,
    appCounter: 0,
  };
  return { state, calls };
});

vi.mock('@/lib/supabase', () => {
  const resolve = (table: string, op: string, eqs: Array<[string, unknown]>) => {
    if (op === 'select-single' || op === 'select-maybe') {
      if (table === 'job_preferences') return (m.state.prefs ?? null) as unknown;
      if (table === 'profiles') return (m.state.profile ?? null) as unknown;
      if (table === 'usage_lifetime') return { auto_apply_used: m.state.lifetimeUsed ?? 0 };
      if (table === 'usage_daily') return { applications_used: m.state.dailyUsed ?? 0 };
      if (table === 'agent_tasks') return null;
      if (table === 'jobs') {
        const external = eqs.find(([c]) => c === 'external_id')?.[1] as string | undefined;
        const manualIds = (m.state.manualExternalIds ?? []) as string[];
        if (external && manualIds.includes(external)) return { id: 'manual-job' };
        return null;
      }
      return null;
    }
    return null;
  };
  const makeChain = (table: string, op: string) => {
    const eqs: Array<[string, unknown]> = [];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { eqs.push([c, v]); return q; },
      in: () => q,
      limit: () => q,
      order: () => q,
      insert: (values: Record<string, unknown>) => {
        if (table === 'jobs') m.calls.insertedJobs.push(values);
        if (table === 'agent_tasks') m.calls.insertedTasks.push(values);
        return q;
      },
      upsert: (values: Record<string, unknown>) => { m.calls.meterWrites.push({ table, values }); return q; },
      update: (values: Record<string, unknown>) => {
        if (table === 'applications') m.calls.appUpdates.push(values);
        if (table === 'usage_lifetime' || table === 'usage_daily') m.calls.meterWrites.push({ table, values });
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: resolve(table, 'select-maybe', eqs), error: null }),
      single: () => {
        if (table === 'jobs' && m.calls.insertedJobs.length > 0) {
          return Promise.resolve({ data: { id: `job-${m.calls.insertedJobs.length}` }, error: null });
        }
        return Promise.resolve({ data: { id: `app-${++m.calls.appCounter}` }, error: null });
      },
      then: (res: (v: unknown) => void) => {
        if (table === 'job_sources') return res({ data: m.state.sources ?? [], error: null });
        if (table === 'subscriptions') return res({ data: m.state.subscriptions ?? [], error: null });
        return res({ data: null, error: null });
      },
    };
    return q;
  };
  const from = (table: string) => makeChain(table, 'chain');
  return { supabaseAdmin: { from } };
});
vi.mock('@packages/security/entitlements', () => ({
  getEntitlement: vi.fn(async () => m.state.entitlement),
  assertEntitlement: vi.fn(async () => m.state.entitlement),
}));
vi.mock('@/lib/applications/service', () => ({
  prepareApplication: vi.fn(async (_userId: string, jobId: string) => {
    const id = `app-${++m.calls.appCounter}`;
    m.state.lastApp = { id, jobId, status: 'PREPARING' };
    return { application: { id, job_id: jobId, status: 'PREPARING' } };
  }),
  appendApplicationEvent: vi.fn(async (_u: string, applicationId: string, event: string) => {
    m.calls.events.push({ applicationId, event });
  }),
}));
vi.mock('@/lib/generation/loader', () => ({
  loadGenerationProfile: vi.fn(async () => ({
    headline: 'Product Designer',
    summary: 'Designer with 4 years of experience.',
    skills: ['Figma', 'Photoshop', 'Prototyping'],
    targetRoles: ['Designer'],
    experience: [{ title: 'Product Designer', company: 'Acme', start: '2022', end: '2026', highlights: ['Owned the design system.'] }],
    education: [{ degree: 'B.A. Design', school: 'University', year: '2022' }],
  })),
}));
vi.mock('@/lib/generation/persist', () => ({
  persistGeneratedDocument: vi.fn(async (input: { kind: string; applicationId: string | undefined }) => {
    m.calls.persisted.push({ kind: input.kind, applicationId: input.applicationId });
    return { id: `doc-${m.calls.persisted.length}`, version: 1, contentHash: 'h' };
  }),
}));
vi.mock('@/lib/email/resend', () => ({
  sendAgentFoundJobsEmail: vi.fn(async () => {
    m.calls.foundEmails++;
    return { ok: true };
  }),
}));

import { roleMatchesTitle, jobMatchesUser, rankMatches, runDiscoveryForUser, runDiscoveryStage, type DiscoveryUserContext } from '@/lib/agent/discovery';

const GH = (id: number, title: string, location = 'Remote') => ({
  source: 'GREENHOUSE' as const,
  external_id: String(id),
  company: 'acme',
  title,
  url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  description: 'A job.',
  location,
  metadata: { sourceId: 'greenhouse:acme' },
});

const USER = (over: Partial<DiscoveryUserContext> = {}): DiscoveryUserContext => ({
  userId: 'u1',
  email: 'u1@example.com',
  plan: 'PREMIUM',
  active: true,
  applicationMode: 'approval',
  dailyTarget: 10,
  targetRoles: ['Graphics Design'],
  remoteTypes: [],
  locations: [],
  salaryMin: null,
  currency: 'NGN',
  applicationsRemaining: 10,
  ...over,
});

const isGh = (url: string) => url.includes('greenhouse.io');

function fakeFetch(jobs: Array<{ id: number; title: string; location?: string }>) {
  return async (url: string | undefined) => {
    m.calls.fetchedUrls.push(String(url));
    const body = {
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        absolute_url: `https://boards.greenhouse.io/acme/jobs/${j.id}`,
        location: { name: j.location ?? 'Remote' },
        content: '<p>Job body.</p>',
      })),
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

const SOURCES = [{ id: 'greenhouse:acme', adapter: 'greenhouse', board: 'acme', enabled: true, compliance: {}, consecutive_failures: 0, last_ok_at: null, cooldown_until: null }];

function reset() {
  m.calls.fetchedUrls.length = 0;
  m.calls.insertedJobs.length = 0;
  m.calls.insertedTasks.length = 0;
  m.calls.appUpdates.length = 0;
  m.calls.events.length = 0;
  m.calls.persisted.length = 0;
  m.calls.meterWrites.length = 0;
  m.calls.foundEmails = 0;
  m.calls.appCounter = 0;
  Object.keys(m.state).forEach((k) => delete m.state[k]);
  m.state.entitlement = { account_status: 'ACTIVE', automation_enabled: true, plan: 'PREMIUM', applications_remaining: 10 };
  m.state.prefs = { active: true, application_mode: 'approval', daily_target: 10, remote_types: [], locations: [], employment_types: [], salary_min: null, currency: 'NGN', discovered_at: null };
  m.state.profile = { email: 'u1@example.com', target_roles: ['Graphics Design'] };
  m.state.sources = SOURCES;
  m.state.subscriptions = [];
}

beforeEach(() => reset());
afterEach(() => vi.clearAllMocks());

describe('roleMatchesTitle (fuzzy but honest)', () => {
  it('matches exact substrings and role words in any order', () => {
    expect(roleMatchesTitle('Graphics Design', 'Senior Graphics Designer')).toBe(true);
    expect(roleMatchesTitle('design', 'Head of Design')).toBe(true);
  });

  it('matches typos and word variants (stemming + edit distance 1)', () => {
    expect(roleMatchesTitle('ai enginer', 'AI Engineer')).toBe(true);
    expect(roleMatchesTitle('Writing', 'Technical Writer')).toBe(true);
    expect(roleMatchesTitle('developer', 'Frontend Developers')).toBe(true);
  });

  it('requires every significant role word (no single-word false positives)', () => {
    expect(roleMatchesTitle('Graphics Design', 'Product Designer')).toBe(false);
    expect(roleMatchesTitle('Data Analyst', 'Data Engineer')).toBe(false);
  });

  it('ignores stopwords like "and"/"of"', () => {
    expect(roleMatchesTitle('Head of Design', 'Design Head')).toBe(true);
  });
});

describe('jobMatchesUser', () => {
  it('requires a submittable Greenhouse/Lever URL', () => {
    expect(jobMatchesUser({ ...GH(1, 'Graphics Designer'), url: 'https://example.com/job' }, USER(), isGh)).toBe(false);
  });

  it('requires a target-role match', () => {
    expect(jobMatchesUser(GH(1, 'Staff Accountant'), USER(), isGh)).toBe(false);
    expect(jobMatchesUser(GH(2, 'Graphics Designer'), USER(), isGh)).toBe(true);
  });

  it('respects location and remote preferences', () => {
    const remoteUser = USER({ remoteTypes: ['Fully remote'], locations: [] });
    expect(jobMatchesUser(GH(1, 'Graphics Designer', 'Remote - Worldwide'), remoteUser, isGh)).toBe(true);
    expect(jobMatchesUser(GH(2, 'Graphics Designer', 'Lagos, Nigeria'), remoteUser, isGh)).toBe(false);
    const lagosUser = USER({ locations: ['Lagos'] });
    expect(jobMatchesUser(GH(3, 'Graphics Designer', 'Lagos, Nigeria'), lagosUser, isGh)).toBe(true);
    expect(jobMatchesUser(GH(4, 'Graphics Designer', 'Berlin, Germany'), lagosUser, isGh)).toBe(false);
    expect(jobMatchesUser(GH(5, 'Graphics Designer', 'Remote (EMEA)'), lagosUser, isGh)).toBe(true);
  });

  it('users without location or remote constraints accept any matching role', () => {
    expect(jobMatchesUser(GH(6, 'Graphics Designer', 'Tokyo, Japan'), USER(), isGh)).toBe(true);
  });
});

describe('rankMatches', () => {
  it('puts exact-substring role matches first', () => {
    const ranked = rankMatches([GH(1, 'Product Designer'), GH(2, 'Graphics Designer')], USER());
    expect(ranked[0].external_id).toBe('2');
  });
});

describe('runDiscoveryForUser', () => {
  it('finds, crafts, and meters a matching job for an approval-mode paid user', async () => {
    const fetchImpl = fakeFetch([{ id: 1, title: 'Senior Graphics Designer' }]);
    const outcome = await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl, isSubmittable: isGh });
    expect(outcome.skipped).toBeUndefined();
    expect(outcome.scanned).toBe(1);
    expect(outcome.matched).toBe(1);
    expect(outcome.created).toBe(1);
    expect(outcome.crafted).toBe(1);
    // one private jobs row, owned by the user
    expect(m.calls.insertedJobs).toHaveLength(1);
    expect(m.calls.insertedJobs[0]).toMatchObject({ source: 'DISCOVERED', company: 'acme', title: 'Senior Graphics Designer' });
    expect(m.calls.insertedJobs[0].metadata).toMatchObject({ originUser: 'u1', discovered: true, sourceId: 'greenhouse:acme' });
    // CV + cover letter crafted and persisted for the application
    expect(m.calls.persisted.map((p) => p.kind).sort()).toEqual(['COVER_LETTER', 'CV']);
    // advanced to AWAITING_APPROVAL + audit events
    expect(m.calls.appUpdates[0]).toMatchObject({ status: 'AWAITING_APPROVAL' });
    expect(m.calls.events.map((e) => e.event)).toEqual(['DISCOVERED', 'PREPARED']);
    // PREMIUM: daily meter incremented; no auto task; one review email
    expect(m.calls.meterWrites.some((w) => w.table === 'usage_daily' && w.values.applications_used === 1)).toBe(true);
    expect(m.calls.insertedTasks).toHaveLength(0);
    expect(m.calls.foundEmails).toBe(1);
  });

  it('auto mode: enqueues the automatic submission instead of the review email', async () => {
    (m.state.prefs as Record<string, unknown>).application_mode = 'auto';
    const fetchImpl = fakeFetch([{ id: 1, title: 'Graphics Designer' }]);
    const outcome = await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl, isSubmittable: isGh });
    expect(outcome.created).toBe(1);
    expect(outcome.autoSubmittedQueued).toBe(1);
    expect(m.calls.insertedTasks).toHaveLength(1);
    expect(m.calls.insertedTasks[0]).toMatchObject({ type: 'APPLICATION', user_id: 'u1' });
    expect(m.calls.insertedTasks[0].payload).toMatchObject({ mode: 'auto' });
    expect(m.calls.foundEmails).toBe(0);
  });

  it('never runs for a FREE / not-entitled user (no board fetch at all)', async () => {
    (m.state.entitlement as Record<string, unknown>).automation_enabled = false;
    const fetchImpl = fakeFetch([{ id: 1, title: 'Graphics Designer' }]);
    const outcome = await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl, isSubmittable: isGh });
    expect(outcome.skipped).toBe('NOT_ENTITLED');
    expect(m.calls.fetchedUrls).toHaveLength(0);
    expect(m.calls.insertedJobs).toHaveLength(0);
  });

  it('skips a paused agent, a user without target roles, or an exhausted quota', async () => {
    (m.state.prefs as Record<string, unknown>).active = false;
    expect((await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl: fakeFetch([]), isSubmittable: isGh })).skipped).toBe('PAUSED');
    reset();
    (m.state.profile as Record<string, unknown>).target_roles = [];
    expect((await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl: fakeFetch([]), isSubmittable: isGh })).skipped).toBe('NO_TARGET_ROLES');
    reset();
    (m.state.entitlement as Record<string, unknown>).applications_remaining = 0;
    expect((await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl: fakeFetch([]), isSubmittable: isGh })).skipped).toBe('QUOTA_EXHAUSTED');
  });

  it('skips a user still inside the 20h discovery cooldown', async () => {
    (m.state.prefs as Record<string, unknown>).discovered_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const outcome = await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl: fakeFetch([]), isSubmittable: isGh });
    expect(outcome.skipped).toBe('COOLDOWN');
  });

  it('never re-adds a link the user already pasted themselves', async () => {
    const fetchImpl = fakeFetch([{ id: 1, title: 'Graphics Designer' }]);
    // Prime the MANUAL row hash by running once, then pretend it was pasted.
    await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl, isSubmittable: isGh });
    const firstExternalId = m.calls.insertedJobs[0].external_id as string;
    reset();
    m.state.manualExternalIds = [firstExternalId];
    const again = await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl, isSubmittable: isGh });
    expect(again.created).toBe(0);
    expect(m.calls.insertedJobs).toHaveLength(0);
    expect(m.calls.persisted).toHaveLength(0);
  });

  it('caps new applications at the daily target and the per-run ceiling', async () => {
    (m.state.prefs as Record<string, unknown>).daily_target = 1;
    const fetchImpl = fakeFetch([
      { id: 1, title: 'Graphics Designer I' },
      { id: 2, title: 'Graphics Designer II' },
    ]);
    const outcome = await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl, isSubmittable: isGh });
    expect(outcome.matched).toBe(2);
    expect(outcome.created).toBe(1);
  });

  it('meters the BASIC lifetime counter instead of the daily one', async () => {
    (m.state.entitlement as Record<string, unknown>).plan = 'BASIC';
    const fetchImpl = fakeFetch([{ id: 1, title: 'Graphics Designer' }]);
    await runDiscoveryForUser('u1', 'u1@example.com', { fetchImpl, isSubmittable: isGh });
    expect(m.calls.meterWrites.some((w) => w.table === 'usage_lifetime' && w.values.auto_apply_used === 1)).toBe(true);
    expect(m.calls.meterWrites.some((w) => w.table === 'usage_daily')).toBe(false);
  });
});

describe('runDiscoveryStage', () => {
  it('does nothing when there are no paid subscriptions', async () => {
    const report = await runDiscoveryStage({ fetchImpl: fakeFetch([]), isSubmittable: isGh });
    expect(report.usersConsidered).toBe(0);
    expect(report.usersRun).toBe(0);
    expect(m.calls.fetchedUrls).toHaveLength(0);
  });

  it('runs discovery for eligible paid users and reports per-source fetches', async () => {
    m.state.subscriptions = [{ user_id: 'u1', plan: 'PREMIUM' }];
    const fetchImpl = fakeFetch([{ id: 1, title: 'Graphics Designer' }]);
    const report = await runDiscoveryStage({ fetchImpl, isSubmittable: isGh });
    expect(report.usersConsidered).toBe(1);
    expect(report.usersRun).toBe(1);
    expect(report.applicationsCreated).toBe(1);
    expect(report.sources).toEqual([{ source: 'greenhouse:acme', ok: true, fetched: 1 }]);
  });
});
