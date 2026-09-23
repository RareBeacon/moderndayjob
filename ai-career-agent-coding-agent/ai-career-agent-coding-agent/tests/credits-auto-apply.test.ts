import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUTO_APPLY credit ledger wiring (Milestone 2 slice 2).
 *
 * Owner decision D3 at the engine outcome level: hold one AUTO_APPLY credit
 * when a real browser submission is about to happen (every gate passed),
 * CONSUME it on a confirmed SUBMITTED, RELEASE it on UNKNOWN (never charge
 * an unconfirmed send), STOP, or a thrown error. Exhaustion stops the
 * application safely with a user-visible reason. Everything is inert until
 * ENTITLEMENTS_LEDGER=true (parallel-run phase).
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
  const rpc = vi.fn();
  const createSignedUrl = vi.fn();
  const storage = { from: vi.fn(() => ({ createSignedUrl })) };
  const appendApplicationEvent = vi.fn();
  const assertEntitlement = vi.fn();
  const submitViaBrowser = vi.fn();

  return { db, updates, from, rpc, storage, createSignedUrl, appendApplicationEvent, assertEntitlement, submitViaBrowser };
});

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: m.from, rpc: m.rpc, storage: m.storage } }));
vi.mock('@/lib/apply/client', () => ({ submitViaBrowser: m.submitViaBrowser }));
const sendApplicationSubmittedEmail = vi.fn(async (_to?: string, _input?: unknown) => ({ ok: true }));
vi.mock('@/lib/email/resend', () => ({ sendApplicationSubmittedEmail: (to: string, input: unknown) => sendApplicationSubmittedEmail(to, input) }));
vi.mock('@packages/security/entitlements', () => ({ assertEntitlement: m.assertEntitlement }));
vi.mock('@/lib/applications/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/applications/service')>();
  return { ...actual, appendApplicationEvent: m.appendApplicationEvent };
});

import { processApplicationTask } from '@/lib/apply/task';
import { computeApprovalSnapshot } from '@/lib/apply/snapshot';

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

async function reset(overrides: Record<string, unknown> = {}) {
  Object.assign(m.db, goodDb(overrides));
  m.updates.length = 0;
  m.assertEntitlement.mockReset().mockResolvedValue(undefined);
  m.submitViaBrowser.mockReset();
  m.appendApplicationEvent.mockReset().mockResolvedValue(undefined);
  m.createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: null }, error: null });
  m.rpc.mockReset().mockResolvedValue({ error: null, data: null });
  vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'true');
  delete process.env.AGENT_DRY_RUN;
  delete process.env.ENTITLEMENTS_LEDGER;
  const snap = await computeApprovalSnapshot('user-1', 'app-1');
  m.db.applications = {
    ...(m.db.applications as Record<string, unknown>),
    approved_at: new Date().toISOString(),
    approval_snapshot: snap,
  };
}

beforeEach(async () => { await reset(); });
afterEach(() => { vi.unstubAllEnvs(); delete process.env.ENTITLEMENTS_LEDGER; });

const TASK_ID = 'task-9';
const REF = `app:app-1:${TASK_ID}`;

function ledgerCalls(fn: string) {
  return m.rpc.mock.calls.filter(([name]) => name === fn);
}

describe('AUTO_APPLY ledger · parallel-run (flag off)', () => {
  it('a confirmed submission touches no ledger rpc', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'SUBMITTED', confirmation: 'C-1', url: URL });
    const out = await processApplicationTask({ application_id: 'app-1' }, TASK_ID);
    expect(out.status).toBe('SUCCEEDED');
    expect(out.result.outcome).toBe('SUBMITTED');
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it('a stopped submission touches no ledger rpc', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'STOP', code: 'CAPTCHA', message: 'captcha' });
    const out = await processApplicationTask({ application_id: 'app-1' }, TASK_ID);
    expect(out.result.outcome).toBe('STOP');
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe('AUTO_APPLY ledger · armed', () => {
  beforeEach(() => {
    process.env.ENTITLEMENTS_LEDGER = 'true';
  });

  it('holds and consumes one credit around a confirmed submission', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'SUBMITTED', confirmation: 'C-1', url: URL });
    const out = await processApplicationTask({ application_id: 'app-1' }, TASK_ID);
    expect(out.status).toBe('SUCCEEDED');
    expect(ledgerCalls('credit_reserve')).toEqual([
      ['credit_reserve', { p_user: 'user-1', p_resource: 'AUTO_APPLY', p_reference: REF }],
    ]);
    expect(ledgerCalls('credit_consume')).toEqual([
      ['credit_consume', { p_user: 'user-1', p_resource: 'AUTO_APPLY', p_reference: REF, p_key: `consume:AUTO_APPLY:${REF}` }],
    ]);
    expect(ledgerCalls('credit_release')).toHaveLength(0);
  });

  it('releases the hold on a safe stop (nothing was submitted)', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'STOP', code: 'CAPTCHA', message: 'captcha' });
    await processApplicationTask({ application_id: 'app-1' }, TASK_ID);
    expect(ledgerCalls('credit_reserve')).toHaveLength(1);
    expect(ledgerCalls('credit_release')).toHaveLength(1);
    expect(ledgerCalls('credit_consume')).toHaveLength(0);
  });

  it('never charges an UNKNOWN (unconfirmed) submission', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'UNKNOWN', code: 'TIMEOUT', message: 'timed out' });
    await processApplicationTask({ application_id: 'app-1' }, TASK_ID);
    expect(ledgerCalls('credit_release')).toHaveLength(1);
    expect(ledgerCalls('credit_consume')).toHaveLength(0);
  });

  it('releases the hold and rethrows when the submission throws', async () => {
    m.submitViaBrowser.mockRejectedValue(new Error('worker crashed'));
    await expect(processApplicationTask({ application_id: 'app-1' }, TASK_ID)).rejects.toThrow('worker crashed');
    expect(ledgerCalls('credit_release')).toHaveLength(1);
    expect(ledgerCalls('credit_consume')).toHaveLength(0);
  });

  it('exhaustion stops the application safely before the browser is touched', async () => {
    m.rpc.mockImplementation((fn: string) =>
      fn === 'credit_reserve'
        ? Promise.resolve({ error: { message: 'CREDIT_EXHAUSTED' } })
        : Promise.resolve({ error: null, data: null }),
    );
    const out = await processApplicationTask({ application_id: 'app-1' }, TASK_ID);
    expect(out.status).toBe('SUCCEEDED');
    expect(out.result).toMatchObject({ outcome: 'STOP', code: 'AUTO_APPLY_CREDITS_EXHAUSTED' });
    expect(m.submitViaBrowser).not.toHaveBeenCalled();
    expect(ledgerCalls('credit_consume')).toHaveLength(0);
    expect(ledgerCalls('credit_release')).toHaveLength(0);
    const appUpdate = m.updates.find((u) => u.table === 'applications' && u.payload.error);
    expect(appUpdate?.payload.error).toContain('auto-apply limit');
    const stopEvent = m.appendApplicationEvent.mock.calls.find(([, , action]) => action === 'AUTO_SUBMIT_STOPPED');
    expect(stopEvent).toBeTruthy();
  });

  it('a consume failure never fails a real submission and cleans the hold up', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'SUBMITTED', confirmation: 'C-2', url: URL });
    m.rpc.mockImplementation((fn: string) =>
      fn === 'credit_consume'
        ? Promise.resolve({ error: { message: 'temporary ledger hiccup' } })
        : Promise.resolve({ error: null, data: null }),
    );
    const out = await processApplicationTask({ application_id: 'app-1' }, TASK_ID);
    expect(out.status).toBe('SUCCEEDED');
    expect(out.result.outcome).toBe('SUBMITTED');
    expect(ledgerCalls('credit_consume')).toHaveLength(1);
    expect(ledgerCalls('credit_release')).toHaveLength(1); // cleanup attempt
  });

  it('without a task id the reference falls back to the application alone', async () => {
    m.submitViaBrowser.mockResolvedValue({ outcome: 'SUBMITTED', confirmation: 'C-3', url: URL });
    await processApplicationTask({ application_id: 'app-1' });
    expect(ledgerCalls('credit_reserve')[0][1].p_reference).toBe('app:app-1');
  });
});
