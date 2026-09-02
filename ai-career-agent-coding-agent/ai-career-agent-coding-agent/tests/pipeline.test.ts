import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processAgentTask, runDailyPipeline, poolIsFresh, failTask, type AgentTask } from '../lib/agent/pipeline';
import type { SourceAdapter } from '../lib/jobsources/types';

/* ---------------- fake supabase client ---------------- */

type UpdateRecord = { table: string; values: Record<string, unknown>; eqs: [string, unknown][] };

function makeDb(opts: { enqueued?: number; claims?: AgentTask[][]; latestJob?: string | null; jobsScript?: ('fresh' | 'stale' | Error)[] } = {}) {
  const calls = { rpcs: [] as { name: string; args: Record<string, unknown> }[], updates: [] as UpdateRecord[] };
  const claimQueue = [...(opts.claims ?? [])];
  const script = [...(opts.jobsScript ?? [])];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ name, args });
      if (name === 'claim_agent_tasks') return { data: claimQueue.splice(0, 1)[0] ?? [], error: null };
      if (name === 'enqueue_daily_discovery') return { data: opts.enqueued ?? 0, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        const rec: UpdateRecord = { table, values, eqs: [] };
        calls.updates.push(rec);
        const eq = (col: string, val: unknown) => {
          rec.eqs.push([col, val]);
          return { eq: (c2: string, v2: unknown) => { rec.eqs.push([c2, v2]); return Promise.resolve({}); } };
        };
        return { eq };
      },
      select: () => ({
        order: () => ({
          limit: async () => {
            if (script.length) {
              const step = script.shift();
              if (step instanceof Error) throw step;
              const ts = step === 'fresh' ? new Date(Date.now() - 60_000).toISOString() : new Date(Date.now() - 8 * 3600_000).toISOString();
              return { data: [{ created_at: ts }] };
            }
            const latest = opts.latestJob;
            return { data: latest === null || latest === undefined ? [] : [{ created_at: latest }] };
          },
        }),
      }),
    }),
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const okAdapter = (n: number): SourceAdapter => ({
  id: 'test:board', label: 'test board',
  fetchBatch: async () => Array.from({ length: n }, (_, i) => ({ source: 'GREENHOUSE', external_id: `t-${i}`, company: 'test', title: 'T', url: 'https://x', description: 'd', location: null, metadata: {} })),
});
const deps = (db: SupabaseClient) => ({ db, adapters: [okAdapter(3)], store: { upsertJobs: async (j: unknown[]) => j.length }, limit: 10, pauseMs: 0 });

const task = (over: Partial<AgentTask> = {}): AgentTask => ({ id: 'task-1', user_id: 'u1', type: 'JOB_DISCOVERY', lease_token: 'lease-1', attempts: 0, payload: {}, ...over });

/* ---------------- tests ---------------- */

describe('pool freshness', () => {
  it('fresh when the newest job is under 6h old', async () => {
    const { db } = makeDb({ latestJob: new Date(Date.now() - 60_000).toISOString() });
    expect(await poolIsFresh(db)).toBe(true);
  });
  it('stale when the newest job is older (or pool empty)', async () => {
    const { db } = makeDb({ latestJob: new Date(Date.now() - 7 * 3600_000).toISOString() });
    expect(await poolIsFresh(db)).toBe(false);
    const { db: db2 } = makeDb({ latestJob: null });
    expect(await poolIsFresh(db2)).toBe(false);
  });
});

describe('processAgentTask', () => {
  it('JOB_DISCOVERY ingests when stale, reports counts', async () => {
    const { db } = makeDb({ latestJob: new Date(Date.now() - 8 * 3600_000).toISOString() });
    const r = await processAgentTask(task(), deps(db));
    expect(r.status).toBe('SUCCEEDED');
    expect(r.result.ingested).toBe(3);
  });
  it('JOB_DISCOVERY skips when pool is fresh', async () => {
    const { db } = makeDb({ latestJob: new Date(Date.now() - 60_000).toISOString() });
    const r = await processAgentTask(task(), deps(db));
    expect(r.result).toEqual({ skipped: 'pool_already_fresh' });
  });
  it('APPLICATION never auto-submits, always WAITING_APPROVAL', async () => {
    const { db } = makeDb({ latestJob: null });
    const r = await processAgentTask(task({ type: 'APPLICATION' }), deps(db));
    expect(r.status).toBe('WAITING_APPROVAL');
    expect(String(r.result.reason)).toContain('user approval');
  });
});

describe('failTask backoff', () => {
  it('re-queues with attempts remaining, FAILs after 3 attempts', async () => {
    const { db, calls } = makeDb();
    await failTask(db, task({ attempts: 1 }), new Error('boom'));
    expect(calls.updates[0].values.status).toBe('QUEUED');
    await failTask(db, task({ attempts: 3 }), new Error('boom'));
    expect(calls.updates[1].values.status).toBe('FAILED');
    // lease-guard columns are always part of the update
    expect(calls.updates[0].eqs).toContainEqual(['lease_token', 'lease-1']);
  });
});

describe('runDailyPipeline, the free production path', () => {
  it('enqueue → baseline ingest → drain tasks, in order, once', async () => {
    const { db, calls } = makeDb({
      enqueued: 2,
      latestJob: null, // stale → pipeline must ingest
      claims: [[task(), task({ id: 'task-2' }), task({ id: 'task-3', type: 'APPLICATION' })]],
    });
    const report = await runDailyPipeline(deps(db));

    expect(report.enqueued).toBe(2);
    // enqueue RPC called with today, claim via leasing RPC
    expect(calls.rpcs.map((r) => r.name)).toEqual(['enqueue_daily_discovery', 'claim_agent_tasks', 'claim_agent_tasks']);
    expect(calls.rpcs[0].args.p_day).toBe(new Date().toISOString().slice(0, 10));
    // baseline refresh ran exactly one ingestion (not one per task)
    expect(report.poolRefresh && 'totalUpserted' in report.poolRefresh ? report.poolRefresh.totalUpserted : null).toBe(3);
    // all three tasks completed; discovery ones fast (pool now fresh), application waits
    expect(report.tasksProcessed).toBe(3);
    const statuses = calls.updates.filter((u) => u.table === 'agent_tasks').map((u) => u.values.status);
    expect(statuses.filter((s) => s === 'SUCCEEDED').length).toBe(2);
    expect(statuses).toContain('WAITING_APPROVAL');
    expect(report.errors).toEqual([]);
  });

  it('skips ingestion entirely when the pool is already fresh', async () => {
    const { db } = makeDb({ enqueued: 0, latestJob: new Date(Date.now() - 60_000).toISOString(), claims: [[task()]] });
    const report = await runDailyPipeline(deps(db));
    expect(report.poolRefresh).toEqual({ skipped: 'pool_already_fresh' });
    expect(report.tasksProcessed).toBe(1);
  });

  it('a dead source board is isolated, no task fails, failures are reported, not thrown', async () => {
    const bad: SourceAdapter = { id: 'bad', label: 'bad', fetchBatch: async () => { throw new Error('BOARD_DOWN'); } };
    const { db } = makeDb({ enqueued: 0, latestJob: null, claims: [[task({ attempts: 0 }), task({ id: 'task-2' })]] });
    const report = await runDailyPipeline({ ...deps(db), adapters: [bad] });
    // ingestion errors are contained per-board: tasks still complete
    expect(report.errors).toEqual([]);
    expect(report.tasksProcessed).toBe(2);
    expect(report.taskOutcomes.every((o) => o.status === 'SUCCEEDED')).toBe(true);
    const refresh = report.poolRefresh && 'failures' in report.poolRefresh ? report.poolRefresh : null;
    expect(refresh?.failures).toBe(1);
    expect(refresh?.totalUpserted).toBe(0);
  });

  it('a task-level error (DB failure) is failed and re-queued, pipeline continues', async () => {
    // baseline sees a fresh pool; task-1's freshness check hits a DB error; task-2 is fine
    const { db, calls } = makeDb({
      enqueued: 0,
      jobsScript: ['fresh', new Error('DB_DOWN'), 'fresh'],
      claims: [[task({ attempts: 0 }), task({ id: 'task-2' })]],
    });
    const report = await runDailyPipeline(deps(db));
    expect(report.errors).toEqual(['task-1: DB_DOWN']);
    expect(report.tasksProcessed).toBe(2);
    expect(report.taskOutcomes.find((o) => o.id === 'task-1')?.status).toBe('ERROR');
    expect(report.taskOutcomes.find((o) => o.id === 'task-2')?.status).toBe('SUCCEEDED');
    // the failed task was re-queued (attempt backoff), guarded by its lease
    const failed = calls.updates.find((u) => u.values.status === 'QUEUED');
    expect(failed?.values.last_error).toBe('DB_DOWN');
    expect(failed?.eqs).toContainEqual(['lease_token', 'lease-1']);
  });

  it('zero active users → still refreshes the pool (free tools depend on it)', async () => {
    const { db } = makeDb({ enqueued: 0, latestJob: null, claims: [] });
    const report = await runDailyPipeline(deps(db));
    expect(report.enqueued).toBe(0);
    expect(report.tasksProcessed).toBe(0);
    expect(report.poolRefresh && 'totalUpserted' in report.poolRefresh ? report.poolRefresh.totalUpserted : null).toBe(3);
  });
});
