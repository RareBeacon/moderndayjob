import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processAgentTask, runDailyPipeline, failTask, type AgentTask } from '../lib/agent/pipeline';

/**
 * Drain-only pipeline (2026-09-20): discovery/ingestion was retired with the
 * job listings feature. The pipeline claims and processes due tasks only;
 * APPLICATION tasks run the autopilot apply agent, legacy JOB_DISCOVERY rows
 * complete as no-ops so old queue entries can never block the drain loop.
 */

vi.mock('../lib/apply/task', () => ({ processApplicationTask: vi.fn() }));
import { processApplicationTask } from '../lib/apply/task';

/* ---------------- fake supabase client ---------------- */

type UpdateRecord = { table: string; values: Record<string, unknown>; eqs: [string, unknown][] };

function makeDb(opts: { claims?: AgentTask[][] } = {}) {
  const calls = { rpcs: [] as { name: string; args: Record<string, unknown> }[], updates: [] as UpdateRecord[] };
  const claimQueue = [...(opts.claims ?? [])];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ name, args });
      if (name === 'claim_agent_tasks') return { data: claimQueue.splice(0, 1)[0] ?? [], error: null };
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
    }),
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const task = (over: Partial<AgentTask> = {}): AgentTask => ({ id: 'task-1', user_id: 'u1', type: 'APPLICATION', lease_token: 'lease-1', attempts: 0, payload: {}, ...over });

/* ---------------- tests ---------------- */

describe('processAgentTask (drain-only)', () => {
  it('routes APPLICATION tasks through the apply processor', async () => {
    vi.mocked(processApplicationTask).mockResolvedValue({ status: 'WAITING_APPROVAL', result: { ok: true } });
    const { db } = makeDb();
    const out = await processAgentTask(task(), { db });
    expect(processApplicationTask).toHaveBeenCalledOnce();
    expect(out.status).toBe('WAITING_APPROVAL');
  });

  it('completes legacy JOB_DISCOVERY tasks as no-ops (discovery retired)', async () => {
    vi.mocked(processApplicationTask).mockClear();
    const { db } = makeDb();
    const out = await processAgentTask(task({ type: 'JOB_DISCOVERY' }), { db });
    expect(out).toEqual({ status: 'SUCCEEDED', result: { skipped: 'discovery_retired' } });
    expect(processApplicationTask).not.toHaveBeenCalled();
  });

  it('completes unknown task types without touching the apply processor', async () => {
    vi.mocked(processApplicationTask).mockClear();
    const { db } = makeDb();
    const out = await processAgentTask(task({ type: 'APPLICATION_EVENT' }), { db });
    expect(out.status).toBe('SUCCEEDED');
    expect(processApplicationTask).not.toHaveBeenCalled();
  });
});

describe('runDailyPipeline', () => {
  it('claims and drains tasks until empty, without any ingestion RPC', async () => {
    vi.mocked(processApplicationTask).mockResolvedValue({ status: 'WAITING_APPROVAL', result: {} });
    const { db, calls } = makeDb({
      claims: [[task({ id: 'a' }), task({ id: 'b' })], [task({ id: 'c' })], []],
    });
    const report = await runDailyPipeline({ db });
    expect(report.tasksProcessed).toBe(3);
    expect(report.taskOutcomes.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    // No discovery enqueue, no pool refresh: only claim RPCs may run.
    expect(calls.rpcs.map((r) => r.name)).toEqual(['claim_agent_tasks', 'claim_agent_tasks', 'claim_agent_tasks']);
    // completed updates carry the lease guard
    expect(calls.updates.length).toBe(3);
    expect(calls.updates[0].values.status).toBe('WAITING_APPROVAL');
  });

  it('fails a task with backoff and keeps draining the rest', async () => {
    vi.mocked(processApplicationTask)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ status: 'SUCCEEDED', result: {} });
    const { db, calls } = makeDb({ claims: [[task({ id: 'bad' }), task({ id: 'good' })], []] });
    const report = await runDailyPipeline({ db });
    expect(report.tasksProcessed).toBe(2);
    expect(report.errors).toEqual(['bad: boom']);
    const failed = calls.updates.find((u) => u.values.status === 'QUEUED');
    expect(failed).toBeTruthy();
    expect(failed!.values.last_error).toBe('boom');
  });

  it('gives up after 3 attempts (FAILED, no re-queue)', async () => {
    const { db, calls } = makeDb();
    await failTask(db, task({ id: 'gone', attempts: 3, lease_token: 'L' }), new Error('x'));
    const failed = calls.updates.find((u) => u.values.status === 'FAILED');
    const requeued = calls.updates.find((u) => u.values.status === 'QUEUED');
    expect(failed).toBeTruthy();
    expect(requeued).toBeFalsy();
    expect(failed!.values.last_error).toBe('x');
  });
});
