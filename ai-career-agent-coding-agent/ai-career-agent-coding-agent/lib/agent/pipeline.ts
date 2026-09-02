import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabase';
import { defaultAdapters } from '../jobsources/boards';
import { runIngestion, type IngestReport, type JobStore } from '../jobsources/ingest';
import { supabaseJobStore } from '../jobsources/store';
import type { SourceAdapter } from '../jobsources/types';

/**
 * Shared agent pipeline, the single source of truth for task processing.
 * Used by BOTH the always-on worker (workers/agent, local/dev or a future
 * paid host) and the free production path (Vercel Cron →
 * /api/cron/daily-pipeline). Same semantics, one implementation.
 */

export interface AgentTask {
  id: string;
  user_id: string;
  type: string;
  lease_token: string;
  attempts: number;
  payload: Record<string, unknown>;
}

/** Ingest at most once per window (upserts are idempotent anyway). */
export const INGEST_FRESHNESS_MS = 6 * 60 * 60 * 1000;

/** Daily safety bound: at most 20 claim rounds × 10 tasks per pipeline run. */
const MAX_CLAIM_ROUNDS = 20;
const CLAIM_BATCH = 10;

export interface PipelineDeps {
  db: SupabaseClient;
  adapters: SourceAdapter[];
  store: JobStore;
  limit?: number;
  pauseMs?: number;
}

function defaultDeps(): PipelineDeps {
  return { db: supabaseAdmin, adapters: defaultAdapters(), store: supabaseJobStore };
}

/** True when the pool was ingested recently (skip duplicate work). */
export async function poolIsFresh(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from('jobs').select('created_at').order('created_at', { ascending: false }).limit(1);
  const latest = ((data ?? []) as { created_at: string }[])[0]?.created_at;
  return !!latest && Date.now() - new Date(latest).getTime() < INGEST_FRESHNESS_MS;
}

/** Ingest now (or skip if fresh). Returns what happened. */
export async function refreshPoolIfStale(deps: PipelineDeps): Promise<IngestReport | { skipped: 'pool_already_fresh' }> {
  if (await poolIsFresh(deps.db)) return { skipped: 'pool_already_fresh' };
  return runIngestion({ adapters: deps.adapters, store: deps.store, limit: deps.limit ?? 30, pauseMs: deps.pauseMs ?? 250 });
}

/** Process one claimed task. Pure decision logic, completion is the caller's job. */
export async function processAgentTask(task: AgentTask, deps: PipelineDeps): Promise<{ status: 'SUCCEEDED' | 'WAITING_APPROVAL'; result: Record<string, unknown> }> {
  if (task.type === 'JOB_DISCOVERY') {
    const outcome = await refreshPoolIfStale(deps);
    if ('skipped' in outcome) return { status: 'SUCCEEDED', result: { skipped: outcome.skipped } };
    return { status: 'SUCCEEDED', result: { ingested: outcome.totalUpserted, sources: outcome.sources } };
  }
  if (task.type === 'APPLICATION') {
    // Autonomous submission stays OFF until an approved site adapter,
    // browser isolation and the full security gate exist. Nothing sends
    // without explicit user approval.
    return { status: 'WAITING_APPROVAL', result: { reason: 'Automation is disabled until an approved site adapter and user approval are available.' } };
  }
  return { status: 'SUCCEEDED', result: { message: 'No operation required.' } };
}

/** Mark a task complete (guarded by its lease token). */
export async function completeTask(db: SupabaseClient, task: AgentTask, status: string, result: Record<string, unknown>): Promise<void> {
  await db.from('agent_tasks').update({ status, result, completed_at: new Date().toISOString(), lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', task.id).eq('lease_token', task.lease_token);
}

/** Fail a task, re-queue with backoff while attempts remain, else give up. */
export async function failTask(db: SupabaseClient, task: AgentTask, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'TASK_FAILED';
  const retry = task.attempts < 3;
  await db.from('agent_tasks').update({ status: retry ? 'QUEUED' : 'FAILED', last_error: message, next_attempt_at: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** task.attempts)).toISOString(), lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', task.id).eq('lease_token', task.lease_token);
}

/** Claim a batch of due tasks via the leasing RPC. */
export async function claimTasks(db: SupabaseClient, limit: number, leaseSeconds: number): Promise<AgentTask[]> {
  const { data, error } = await db.rpc('claim_agent_tasks', { p_limit: limit, p_lease_seconds: leaseSeconds });
  if (error) throw error;
  return (data ?? []) as AgentTask[];
}

export interface PipelineReport {
  day: string;
  enqueued: number;
  poolRefresh: IngestReport | { skipped: 'pool_already_fresh' } | null;
  tasksProcessed: number;
  taskOutcomes: { id: string; type: string; status: string }[];
  errors: string[];
}

/**
 * The whole daily cycle, in order:
 *  1. enqueue today's discovery tasks (idempotent RPC, on conflict do nothing)
 *  2. refresh the job pool if stale (also covers the zero-active-users case,
 *     so free tools like Salary Insights always have a populated pool)
 *  3. claim + process tasks until drained (each completes fast; the pool is
 *     already fresh by then)
 */
export async function runDailyPipeline(partial: Partial<PipelineDeps> = {}): Promise<PipelineReport> {
  const deps: PipelineDeps = { ...defaultDeps(), ...partial };
  const day = new Date().toISOString().slice(0, 10);
  const report: PipelineReport = { day, enqueued: 0, poolRefresh: null, tasksProcessed: 0, taskOutcomes: [], errors: [] };

  // 1, enqueue (idempotent)
  const { data: enqueued, error: enqueueError } = await deps.db.rpc('enqueue_daily_discovery', { p_day: day });
  if (enqueueError) throw enqueueError;
  report.enqueued = Number(enqueued) || 0;

  // 2, baseline pool refresh
  report.poolRefresh = await refreshPoolIfStale(deps);

  // 3, drain tasks
  for (let round = 0; round < MAX_CLAIM_ROUNDS; round++) {
    const tasks = await claimTasks(deps.db, CLAIM_BATCH, 300);
    if (!tasks.length) break;
    for (const task of tasks) {
      try {
        const { status, result } = await processAgentTask(task, deps);
        await completeTask(deps.db, task, status, result);
        report.taskOutcomes.push({ id: task.id, type: task.type, status });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'TASK_FAILED';
        await failTask(deps.db, task, error).catch(() => {});
        report.taskOutcomes.push({ id: task.id, type: task.type, status: 'ERROR' });
        report.errors.push(`${task.id}: ${message}`);
      }
      report.tasksProcessed++;
    }
  }

  return report;
}
