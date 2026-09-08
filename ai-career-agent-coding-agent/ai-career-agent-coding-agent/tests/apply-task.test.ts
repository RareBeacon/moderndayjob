import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * APPLICATION task processor (Phase 9). This is the boundary where the
 * browser is NEVER trusted: entitlement, application state, the per-user
 * pause, the global kill switch and package/truthfulness are all re-checked
 * server-side from the database before submitViaBrowser is even considered.
 * These tests pin every gate, the submit/stop outcomes, and that the
 * applications table is only mutated with owner-scoped filters.
 */

const m = vi.hoisted(() => {
  const db: Record<string, unknown> = {
    applications: null, jobs: null, preferences: null, profiles: null, docs: [], masterCv: null,
  };
  const updates: Array<{ table: string; payload: Record<string, unknown>; eqs: Record<string, unknown> }> = [];

  const resolve = (state: { table: string; update: Record<string, unknown> | null; eqs: Record<string, unknown> }) => {
    if (state.update) {
      updates.push({ table: state.table, payload: state.update, eqs: state.eqs });
      return { data: null, error: null };
    }
    switch (state.table) {
      case 'applications': return { data: db.applications ?? null, error: null };
      case 'jobs': return { data: db.jobs ?? null, error: null };
      case 'job_preferences': return { data: db.preferences ?? null, error: null };
      case 'profiles': return { data: db.profiles ?? null, error: null };
      case 'generated_documents': return { data: db.docs ?? [], error: null };
      case 'documents': return { data: db.masterCv ?? null, error: null };
      default: return { data: null, error: null };
    }
  };

  const makeChain = (table: string) => {
    const state: { table: string; update: Record<string, unknown> | null; eqs: Record<string, unknown> } = {
      table, update: null, eqs: {},
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { state.eqs[c] = v; return q; },
      order: () => q,
      limit: () => q,
      update: (p: Record<string, unknown>) => { state.update = p; return q; },
      maybeSingle: () => resolve(state),
      then: (res: (v: unknown) => void) => res(resolve(state)),
    };
    return q;
  };

  const from = vi.fn((table: string) => makeChain(table));
  const createSignedUrl = vi.fn();
  const storage = { from: vi.fn(() => ({ createSignedUrl })) };
  const appendApplicationEvent = vi.fn();
  const assertEntitlement = vi.fn();
  const submitViaBrowser = vi.fn();

  return { db, updates, from, storage, createSignedUrl, appendApplicationEvent, assertEntitlement, submitViaBrowser };
});

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: m.from, storage: m.storage } }));
vi.mock('@/lib/apply/client', () => ({ submitViaBrowser: m.submitViaBrowser }));
vi.mock('@packages/security/entitlements', () => ({ assertEntitlement: m.assertEntitlement }));
vi.mock('@/lib/applications/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/applications/service')>();
  return { ...actual, appendApplicationEvent: m.appendApplicationEvent };
});

import { processApplicationTask } from '@/lib/apply/task';

const URL = 'https://boards.greenhouse.io/acme/jobs/123';
const NOW = new Date().toISOString();

function goodDb(overrides: Record<string, unknown> = {}) {
  return {
    applications: { id: 'app-1', user_id: 'user-1', job_id: 'job-1', email: 'a@b.co', status: 'APPROVED', submitted_at: null, created_at: NOW, error: null },
    jobs: { id: 'job-1', company: 'Acme', title: 'Engineer', url: URL, created_at: NOW },
    preferences: { active: true },
    profiles: { full_name: 'Ada Lovelace', application_email: 'ada@b.co' },
    docs: [{ kind: 'COVER_LETTER', title: 'CL', content: 'Dear…', source_facts: { truthfulnessPassed: true } }],
    masterCv: null,
    ...overrides,
  };
}

function reset(overrides: Record<string, unknown> = {}) {
  Object.assign(m.db, goodDb(overrides));
  m.updates.length = 0;
  m.assertEntitlement.mockReset().mockResolvedValue(undefined); // entitled by default
  m.submitViaBrowser.mockReset();
  m.appendApplicationEvent.mockReset().mockResolvedValue(undefined);
  m.createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: null }, error: null });
  vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'true');
}

beforeEach(() => reset());
afterEach(() => vi.unstubAllEnvs());

describe('processApplicationTask — early returns', () => {
  it('returns WAITING_APPROVAL when the payload lacks an application id', async () => {
    const out = await processApplicationTask({});
    expect(out.status).toBe('WAITING_APPROVAL');
    expect(out.result.reason).toBe('MISSING_APPLICATION_ID');
    expect(m.submitViaBrowser).not.toHaveBeenCalled();
  });

  it('returns APPLICATION_NOT_FOUND for an unknown application', async () => {
    m.db.applications = null;
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('APPLICATION_NOT_FOUND');
  });

  it('returns JOB_NOT_FOUND when the job is missing', async () => {
    m.db.jobs = null;
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('JOB_NOT_FOUND');
  });
});

describe('processApplicationTask — server-side gates (browser never reached)', () => {
  it('blocks on the global kill switch', async () => {
    vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', '1'); // anything but the exact 'true'
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.status).toBe('WAITING_APPROVAL');
    expect(out.result.reason).toBe('AUTOMATION_DISABLED');
    expect(m.submitViaBrowser).not.toHaveBeenCalled();
  });

  it('blocks when the user has paused their agent', async () => {
    m.db.preferences = { active: false };
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('AGENT_PAUSED');
  });

  it('blocks a non-APPROVED application', async () => {
    m.db.applications = { ...(m.db.applications as object), status: 'AWAITING_APPROVAL' };
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('NOT_APPROVED');
  });

  it('blocks when the user is not automation-entitled', async () => {
    m.assertEntitlement.mockRejectedValue(new Error('AUTOMATION_NOT_ENTITLED'));
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('NOT_ENTITLED');
  });

  it('blocks an unsupported employer platform', async () => {
    m.db.jobs = { ...(m.db.jobs as object), url: 'https://example.com/job/1' };
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('UNSUPPORTED_PLATFORM');
  });

  it('blocks an expired job', async () => {
    const stale = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    m.db.jobs = { ...(m.db.jobs as object), created_at: stale };
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('EXPIRED_JOB');
  });

  it('blocks when no email and no package are available', async () => {
    m.db.profiles = { full_name: 'Ada', application_email: null };
    m.db.applications = { ...(m.db.applications as object), email: null };
    m.db.docs = [];
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('REQUIRED_FIELDS_MISSING');
  });

  it('blocks when a document failed the truthfulness check', async () => {
    m.db.docs = [{ kind: 'COVER_LETTER', title: 'CL', content: 'x', source_facts: { truthfulnessPassed: false } }];
    const out = await processApplicationTask({ application_id: 'app-1' });
    expect(out.result.reason).toBe('TRUTHFULNESS_ISSUE');
  });

  it('never calls the browser for any gate-blocked outcome', async () => {
    m.db.preferences = { active: false };
    await processApplicationTask({ application_id: 'app-1' });
    expect(m.submitViaBrowser).not.toHaveBeenCalled();
  });
});

describe('processApplicationTask — submit outcomes', () => {
  it('on SUBMITTED, marks the application SUBMITTED (owner-scoped) and audits', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'SUBMITTED', confirmation: 'thanks', url: URL });
    const out = await processApplicationTask({ application_id: 'app-1' });

    expect(out.status).toBe('SUCCEEDED');
    expect(out.result.outcome).toBe('SUBMITTED');
    expect(m.submitViaBrowser).toHaveBeenCalledWith(
      expect.objectContaining({ jobUrl: URL, allowedDomains: expect.arrayContaining(['boards.greenhouse.io']) }),
    );

    const update = m.updates.find((u) => u.payload?.status === 'SUBMITTED');
    expect(update).toBeTruthy();
    expect(update!.eqs.id).toBe('app-1');
    expect(update!.eqs.user_id).toBe('user-1');
    expect(m.appendApplicationEvent).toHaveBeenCalledWith('user-1', 'app-1', 'SUBMITTED', expect.objectContaining({ method: 'automated' }));
  });

  it('on a safe STOP, records the reason on the application and audits AUTO_SUBMIT_STOPPED', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'STOP', code: 'CAPTCHA', message: 'bot check' });
    const out = await processApplicationTask({ application_id: 'app-1' });

    expect(out.status).toBe('SUCCEEDED');
    expect(out.result.outcome).toBe('STOP');
    const update = m.updates.find((u) => u.payload?.error === 'bot check');
    expect(update).toBeTruthy();
    expect(update!.eqs.id).toBe('app-1');
    expect(m.appendApplicationEvent).toHaveBeenCalledWith('user-1', 'app-1', 'AUTO_SUBMIT_STOPPED', expect.objectContaining({ code: 'CAPTCHA' }));
  });
});
