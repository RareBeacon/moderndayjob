import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Approval snapshot + 24h window (B-181): an approval is bound to the exact
 * package it approved. Editing the package, changing the email, or letting a
 * day pass invalidates it; verification then reverts to AWAITING_APPROVAL.
 */

const m = vi.hoisted(() => {
  const db: Record<string, unknown> = {
    applications: null as Record<string, unknown> | null,
    docs: [] as Array<Record<string, unknown>>,
    masterCv: null as Record<string, unknown> | null,
  };
  const updates: Array<{ table: string; values: Record<string, unknown>; eqs: Record<string, unknown> }> = [];
  const events: Array<Record<string, unknown>> = [];

  const makeChain = (table: string) => {
    const state: { update: Record<string, unknown> | null; eqs: Record<string, unknown> } = { update: null, eqs: {} };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { state.eqs[c] = v; return q; },
      order: () => q,
      limit: () => q,
      update: (values: Record<string, unknown>) => { state.update = values; return q; },
      insert: (values: Record<string, unknown>) => { events.push(values); return q; },
      maybeSingle: () => resolveNow(),
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) => {
        if (state.update) {
          updates.push({ table, values: state.update, eqs: state.eqs });
          res({ data: null, error: null });
          return;
        }
        const d = resolveData(table);
        if (d instanceof Error) rej(d);
        else res({ data: d, error: null });
      },
    };
    const resolveNow = () => {
      const d = resolveData(table);
      return Promise.resolve({ data: d instanceof Error ? null : d, error: null });
    };
    const resolveData = (t: string) => {
      if (t === 'applications') return db.applications;
      if (t === 'generated_documents') return db.docs;
      if (t === 'documents') return db.masterCv;
      return null;
    };
    return q;
  };
  const from = vi.fn((table: string) => makeChain(table));
  return { db, updates, events, from };
});

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: m.from } }));

import {
  computeApprovalSnapshot,
  verifyApprovalSnapshot,
  verifyApprovalAndRevert,
  APPROVAL_WINDOW_MS,
} from '@/lib/apply/snapshot';

const NOW = new Date('2026-09-16T12:00:00Z');

function goodDb(over: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    user_id: 'user-1',
    email: 'a@b.co',
    status: 'APPROVED',
    approved_at: NOW.toISOString(),
    approval_snapshot: null as unknown,
    ...over,
  };
}

async function bindSnapshot(over: Record<string, unknown> = {}) {
  const app = goodDb(over);
  m.db.applications = app;
  app.approval_snapshot = await computeApprovalSnapshot('user-1', 'app-1');
  return app;
}

beforeEach(() => {
  m.db.docs = [{ kind: 'COVER_LETTER', title: 'CL', content: 'Dear team' }];
  m.db.masterCv = null;
  m.updates.length = 0;
  m.events.length = 0;
});

describe('computeApprovalSnapshot (B-181)', () => {
  it('hashes deterministically over docs + email', async () => {
    m.db.applications = goodDb();
    const a = await computeApprovalSnapshot('user-1', 'app-1');
    const b = await computeApprovalSnapshot('user-1', 'app-1');
    expect(a.hash).toBe(b.hash);
    expect(a.docs.map((d) => d.kind)).toEqual(['COVER_LETTER']);
  });

  it('changes when the package changes', async () => {
    const before = await computeApprovalSnapshot('user-1', 'app-1');
    (m.db.docs as Array<Record<string, unknown>>).push({ kind: 'ANSWERS', title: 'A', content: '{}' });
    const after = await computeApprovalSnapshot('user-1', 'app-1');
    expect(after.hash).not.toBe(before.hash);
  });

  it('changes when the email changes', async () => {
    m.db.applications = goodDb();
    const before = await computeApprovalSnapshot('user-1', 'app-1');
    m.db.applications = goodDb({ email: 'other@b.co' });
    const after = await computeApprovalSnapshot('user-1', 'app-1');
    expect(after.hash).not.toBe(before.hash);
  });
});

describe('verifyApprovalSnapshot (B-181)', () => {
  it('passes when nothing changed', async () => {
    const app = await bindSnapshot();
    m.db.applications = app;
    const v = await verifyApprovalSnapshot('user-1', 'app-1', NOW);
    expect(v.ok).toBe(true);
  });

  it('fails STALE when the package changed after approval', async () => {
    const app = await bindSnapshot();
    m.db.applications = app;
    (m.db.docs as Array<Record<string, unknown>>).push({ kind: 'ANSWERS', title: 'A', content: '{"answers":[]}' });
    const v = await verifyApprovalSnapshot('user-1', 'app-1', NOW);
    expect(v).toMatchObject({ ok: false, code: 'APPROVAL_STALE' });
  });

  it('fails EXPIRED after the 24h window', async () => {
    const app = await bindSnapshot();
    m.db.applications = app;
    const later = new Date(NOW.getTime() + APPROVAL_WINDOW_MS + 60_000);
    const v = await verifyApprovalSnapshot('user-1', 'app-1', later);
    expect(v).toMatchObject({ ok: false, code: 'APPROVAL_EXPIRED' });
  });

  it('fails MISSING without a stored snapshot or approval', async () => {
    m.db.applications = goodDb({ approval_snapshot: null });
    expect(await verifyApprovalSnapshot('user-1', 'app-1', NOW)).toMatchObject({ ok: false, code: 'APPROVAL_MISSING' });
    m.db.applications = null;
    expect(await verifyApprovalSnapshot('user-1', 'app-1', NOW)).toMatchObject({ ok: false, code: 'APPROVAL_MISSING' });
    m.db.applications = goodDb({ status: 'AWAITING_APPROVAL' });
    expect(await verifyApprovalSnapshot('user-1', 'app-1', NOW)).toMatchObject({ ok: false, code: 'APPROVAL_MISSING' });
  });
});

describe('verifyApprovalAndRevert (B-181)', () => {
  it('reverts a stale approval to AWAITING_APPROVAL with an audit event', async () => {
    const app = await bindSnapshot();
    m.db.applications = app;
    (m.db.docs as Array<Record<string, unknown>>)[0] = { kind: 'COVER_LETTER', title: 'CL', content: 'Edited after approval' };
    const v = await verifyApprovalAndRevert('user-1', 'app-1', NOW);
    expect(v).toMatchObject({ ok: false, code: 'APPROVAL_STALE' });
    const revert = m.updates.find((u) => u.table === 'applications' && u.values.status === 'AWAITING_APPROVAL');
    expect(revert).toBeTruthy();
    expect(m.events.length).toBeGreaterThan(0);
  });

  it('does not touch a valid approval', async () => {
    const app = await bindSnapshot();
    m.db.applications = app;
    const v = await verifyApprovalAndRevert('user-1', 'app-1', NOW);
    expect(v.ok).toBe(true);
    expect(m.updates.filter((u) => u.values.status === 'AWAITING_APPROVAL')).toHaveLength(0);
  });
});
