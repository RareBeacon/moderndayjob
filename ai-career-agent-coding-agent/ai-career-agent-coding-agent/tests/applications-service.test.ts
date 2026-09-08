import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Application lifecycle service (Phase 9). Tests the owner-scoped, idempotent
 * service layer that the routes call: prepareApplication dedupe + race
 * recovery, approveApplication's server-side gates (expiry, email, package),
 * and requestAutoSubmit's kill-switch / entitlement / platform / idempotency
 * behavior. The browser is never trusted; every fetch/update filters by
 * user_id in addition to id.
 */

const m = vi.hoisted(() => {
  const trace: Array<{
    table: string;
    eqs: Record<string, unknown>;
    ins: Record<string, unknown[]>;
    updatePayload: Record<string, unknown> | null;
    insertPayload: Record<string, unknown> | null;
    hasCount: boolean;
  }> = [];
  let impl: ((state: QueryState) => unknown) | null = null;

  interface QueryState {
    table: string;
    eqs: Record<string, unknown>;
    ins: Record<string, unknown[]>;
    updatePayload: Record<string, unknown> | null;
    insertPayload: Record<string, unknown> | null;
    hasCount: boolean;
  }

  const resolve = (state: QueryState) => {
    trace.push({
      table: state.table,
      eqs: { ...state.eqs },
      ins: { ...state.ins },
      updatePayload: state.updatePayload,
      insertPayload: state.insertPayload,
      hasCount: state.hasCount,
    });
    return impl!(state);
  };

  const makeChain = (table: string) => {
    const state: QueryState = { table, eqs: {}, ins: {}, updatePayload: null, insertPayload: null, hasCount: false };
    const q: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        if (args[1] && typeof args[1] === 'object' && 'count' in (args[1] as object)) state.hasCount = true;
        return q;
      },
      eq: (c: string, v: unknown) => { state.eqs[c] = v; return q; },
      in: (c: string, v: unknown[]) => { state.ins[c] = v; return q; },
      order: () => q,
      limit: () => q,
      update: (p: Record<string, unknown>) => { state.updatePayload = p; return q; },
      insert: (p: Record<string, unknown>) => { state.insertPayload = p; return q; },
      maybeSingle: () => resolve(state),
      single: () => resolve(state),
      then: (res: (v: unknown) => void) => res(resolve(state)),
    };
    return q;
  };

  const from = vi.fn((table: string) => makeChain(table));
  const supabaseAdmin = { from };
  const assertEntitlement = vi.fn();

  return { trace, from, supabaseAdmin, assertEntitlement, setImpl: (fn: (s: QueryState) => unknown) => { impl = fn; } };
});

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: m.supabaseAdmin }));
vi.mock('@packages/security/entitlements', () => ({ assertEntitlement: m.assertEntitlement }));

import {
  approveApplication,
  prepareApplication,
  requestAutoSubmit,
} from '@/lib/applications/service';
import { AppActionError } from '@/lib/applications/service';

type Row = Record<string, unknown>;

interface Db {
  ownerId: string;
  app: Row | null;
  job: Row | null;
  profile: Row | null;
  docs: Row[];
  genCount: number;
  cvCount: number;
  timeline: Row[];
  existingApp: Row | null; // dedupe lookup in prepareApplication
  racedApp: Row | null; // idempotency_key lookup on insert race
  existingTask: Row | null; // auto-submit idempotency lookup
  appInsertResult: Row | null;
  appInsertError: unknown | null;
  taskInsertResult: Row | null;
  taskInsertError: unknown | null;
}

function defaultDb(overrides: Partial<Db> = {}): Db {
  return {
    ownerId: 'user-1',
    app: { id: 'app-1', user_id: 'user-1', job_id: 'job-1', email: 'a@b.co', status: 'AWAITING_APPROVAL', submitted_at: null, created_at: new Date().toISOString(), error: null },
    job: { id: 'job-1', company: 'Acme', title: 'Engineer', url: 'https://boards.greenhouse.io/acme/jobs/123', location: null, created_at: new Date().toISOString() },
    profile: { application_email: 'ada@b.co' },
    docs: [{ id: 'd1', kind: 'COVER_LETTER', title: 'CL', version: 1, created_at: new Date().toISOString(), content: 'x', source_facts: { truthfulnessPassed: true } }],
    genCount: 1,
    cvCount: 0,
    timeline: [],
    existingApp: null,
    racedApp: null,
    existingTask: null,
    appInsertResult: { id: 'new-app' },
    appInsertError: null,
    taskInsertResult: { id: 'task-1' },
    taskInsertError: null,
    ...overrides,
  };
}

function mkResolver(db: Db) {
  return (state: { table: string; eqs: Record<string, unknown>; ins: Record<string, unknown[]>; updatePayload: Record<string, unknown> | null; insertPayload: Record<string, unknown> | null; hasCount: boolean }): unknown => {
    const t = state.table;
    if (state.updatePayload) {
      if (t === 'applications') {
        if (db.app) Object.assign(db.app, state.updatePayload);
        return { data: db.app, error: null, count: null };
      }
      return { data: null, error: null, count: null };
    }
    if (state.insertPayload) {
      if (t === 'applications') return { data: db.appInsertResult, error: db.appInsertError ?? null, count: null };
      if (t === 'agent_tasks') return { data: db.taskInsertResult, error: db.taskInsertError ?? null, count: null };
      return { data: null, error: null, count: null };
    }
    switch (t) {
      case 'applications': {
        // Owner-scoped reads: a row only exists for its owner (RLS semantics).
        if (state.eqs.user_id !== undefined && state.eqs.user_id !== db.ownerId) return { data: null, error: null, count: null };
        if (state.ins.status) return { data: db.existingApp, error: null, count: null }; // prepare dedupe
        if (state.eqs.idempotency_key) return { data: db.racedApp, error: null, count: null }; // race recovery
        // Honor eqs.id: reads after an insert (new/raced/existing id) resolve to that row.
        if (state.eqs.id !== undefined && db.app && state.eqs.id !== db.app.id) {
          return { data: { ...db.app, id: state.eqs.id }, error: null, count: null };
        }
        return { data: db.app, error: null, count: null };
      }
      case 'jobs': return { data: db.job, error: null, count: null };
      case 'profiles': return { data: db.profile, error: null, count: null };
      case 'generated_documents': return state.hasCount ? { data: null, count: db.genCount, error: null } : { data: db.docs, error: null, count: null };
      case 'documents': return state.hasCount ? { data: null, count: db.cvCount, error: null } : { data: null, error: null, count: null };
      case 'agent_tasks': {
        if (state.eqs.type === 'APPLICATION') return { data: db.existingTask, error: null, count: null }; // auto-submit idempotency
        return { data: db.timeline, error: null, count: null }; // fetchTimeline
      }
      default: return { data: null, error: null, count: null };
    }
  };
}

function setup(overrides: Partial<Db> = {}) {
  const db = defaultDb(overrides);
  m.trace.length = 0;
  m.setImpl(mkResolver(db));
  m.assertEntitlement.mockReset().mockResolvedValue(undefined);
  return db;
}

beforeEach(() => setup());
afterEach(() => vi.unstubAllEnvs());

describe('prepareApplication (idempotent create)', () => {
  it('rejects an unknown job', async () => {
    const db = setup({ job: null });
    await expect(prepareApplication('user-1', 'job-1', 'a@b.co')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an expired job listing', async () => {
    const stale = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    setup({ job: { id: 'job-1', company: 'Acme', title: 'E', url: null, location: null, created_at: stale } });
    await expect(prepareApplication('user-1', 'job-1', 'a@b.co')).rejects.toMatchObject({ code: 'EXPIRED_JOB' });
  });

  it('returns the existing application when one is already active (idempotent)', async () => {
    setup({ existingApp: { id: 'app-9' } });
    const detail = await prepareApplication('user-1', 'job-1', 'a@b.co');
    expect(detail.application.id).toBe('app-9');
    // no insert was attempted
    expect(m.trace.some((q) => q.insertPayload && q.table === 'applications')).toBe(false);
  });

  it('creates a PREPARING application and writes a PREPARED event', async () => {
    setup();
    const detail = await prepareApplication('user-1', 'job-1', 'fallback@b.co');
    expect(detail.application.id).toBe('new-app');
    const insert = m.trace.find((q) => q.insertPayload && q.table === 'applications');
    expect(insert!.insertPayload).toMatchObject({ user_id: 'user-1', job_id: 'job-1', status: 'PREPARING', idempotency_key: 'assist:user-1:job-1' });
    const event = m.trace.find((q) => q.insertPayload && q.table === 'agent_tasks');
    expect(event!.insertPayload).toMatchObject({ type: 'APPLICATION_EVENT', status: 'COMPLETED' });
  });

  it('recovers from an insert race by returning the row that won', async () => {
    setup({ appInsertError: { code: '23505' }, racedApp: { id: 'app-race' } });
    const detail = await prepareApplication('user-1', 'job-1', 'a@b.co');
    expect(detail.application.id).toBe('app-race');
  });

  it('throws DUPLICATE when an insert fails with no recoverable row', async () => {
    setup({ appInsertError: { code: '23505' }, racedApp: null });
    await expect(prepareApplication('user-1', 'job-1', 'a@b.co')).rejects.toMatchObject({ code: 'DUPLICATE' });
  });
});

describe('approveApplication (server-side gates)', () => {
  it('cannot approve another user\'s application (owner-scoped fetch)', async () => {
    setup();
    await expect(approveApplication('evil-user', 'app-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('blocks approval of an expired job', async () => {
    const stale = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    setup({ job: { id: 'job-1', company: 'Acme', title: 'E', url: null, location: null, created_at: stale } });
    await expect(approveApplication('user-1', 'app-1')).rejects.toMatchObject({ code: 'EXPIRED_JOB' });
  });

  it('blocks approval without an email or a package', async () => {
    setup({ app: { id: 'app-1', user_id: 'user-1', job_id: 'job-1', email: '', status: 'AWAITING_APPROVAL', submitted_at: null, created_at: new Date().toISOString(), error: null }, genCount: 0 });
    await expect(approveApplication('user-1', 'app-1')).rejects.toMatchObject({ code: 'REQUIRED_FIELDS_MISSING' });
  });

  it('approves a ready application, updating status and writing an APPROVED event', async () => {
    setup();
    const detail = await approveApplication('user-1', 'app-1');
    expect(detail.application.status).toBe('APPROVED');
    const update = m.trace.find((q) => q.updatePayload && q.table === 'applications');
    expect(update!.updatePayload).toEqual({ status: 'APPROVED' });
    expect(update!.eqs).toMatchObject({ id: 'app-1', user_id: 'user-1' });
    const event = m.trace.find((q) => q.insertPayload && q.table === 'agent_tasks');
    expect((event!.insertPayload!.result as { event: string }).event).toBe('APPROVED');
  });
});

describe('requestAutoSubmit (kill switch + entitlement + idempotency)', () => {
  it('blocks when the global kill switch is off', async () => {
    vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'false');
    setup({ app: { id: 'app-1', user_id: 'user-1', job_id: 'job-1', email: 'a@b.co', status: 'APPROVED', submitted_at: null, created_at: new Date().toISOString(), error: null } });
    await expect(requestAutoSubmit('user-1', 'app-1')).rejects.toMatchObject({ code: 'AUTOMATION_DISABLED' });
  });

  it('requires an APPROVED application', async () => {
    vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'true');
    setup();
    await expect(requestAutoSubmit('user-1', 'app-1')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('blocks non-entitled users', async () => {
    vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'true');
    setup({ app: { id: 'app-1', user_id: 'user-1', job_id: 'job-1', email: 'a@b.co', status: 'APPROVED', submitted_at: null, created_at: new Date().toISOString(), error: null } });
    m.assertEntitlement.mockRejectedValue(new Error('AUTOMATION_NOT_ENTITLED'));
    await expect(requestAutoSubmit('user-1', 'app-1')).rejects.toMatchObject({ code: 'NOT_ENTITLED' });
  });

  it('blocks an unsupported employer platform', async () => {
    vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'true');
    setup({ app: { id: 'app-1', user_id: 'user-1', job_id: 'job-1', email: 'a@b.co', status: 'APPROVED', submitted_at: null, created_at: new Date().toISOString(), error: null }, job: { id: 'job-1', company: 'Acme', title: 'E', url: 'https://example.com/job/1', location: null, created_at: new Date().toISOString() } });
    await expect(requestAutoSubmit('user-1', 'app-1')).rejects.toMatchObject({ code: 'UNSUPPORTED_PLATFORM' });
  });

  it('reuses an already-queued submission task (idempotent)', async () => {
    vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'true');
    setup({ app: { id: 'app-1', user_id: 'user-1', job_id: 'job-1', email: 'a@b.co', status: 'APPROVED', submitted_at: null, created_at: new Date().toISOString(), error: null }, existingTask: { id: 'task-9' } });
    const { taskId } = await requestAutoSubmit('user-1', 'app-1');
    expect(taskId).toBe('task-9');
    expect(m.trace.some((q) => q.insertPayload && q.table === 'agent_tasks')).toBe(false);
  });

  it('enqueues a QUEUED APPLICATION task and records a SUBMISSION_REQUESTED event', async () => {
    vi.stubEnv('AUTOMATION_SUBMIT_ENABLED', 'true');
    setup({ app: { id: 'app-1', user_id: 'user-1', job_id: 'job-1', email: 'a@b.co', status: 'APPROVED', submitted_at: null, created_at: new Date().toISOString(), error: null } });
    const { taskId } = await requestAutoSubmit('user-1', 'app-1');
    expect(taskId).toBe('task-1');
    const insert = m.trace.find((q) => q.insertPayload && q.table === 'agent_tasks');
    expect(insert!.insertPayload).toMatchObject({ type: 'APPLICATION', status: 'QUEUED', application_id: 'app-1' });
    const event = m.trace.find((q) => q.insertPayload && q.table === 'agent_tasks' && (q.insertPayload!.result as { event: string } | undefined)?.event === 'SUBMISSION_REQUESTED');
    expect(event).toBeTruthy();
  });

  it('is an AppActionError subclass for route mapping', () => {
    expect(new AppActionError('NOT_FOUND', 'x')).toBeInstanceOf(Error);
  });
});
