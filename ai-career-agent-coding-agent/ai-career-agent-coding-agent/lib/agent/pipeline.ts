import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabase';
import { processApplicationTask } from '../apply/task';
import { runDiscoveryForUser, runDiscoveryStage } from './discovery';
import { ensurePeriodGrants } from '../credits';

/**
 * Shared agent pipeline, the single source of truth for task processing.
 * Used by BOTH the always-on worker (workers/agent, local/dev or a future
 * paid host) and the free production path (Vercel Cron →
 * /api/cron/daily-pipeline). Same semantics, one implementation.
 *
 * Scope note (2026-09-21, owner decision): job discovery is BACK, per-user.
 * The agent reads each paid user's preferences and target roles, finds
 * matching roles on the public boards in the job_sources registry, crafts
 * the application package, and (auto send policy) submits it after every
 * server-side gate. The shared jobs pool and the public job browser remain
 * retired: discovered rows are private to the user they were found for.
 */

export interface AgentTask {
  id: string;
  user_id: string;
  type: string;
  lease_token: string;
  attempts: number;
  payload: Record<string, unknown>;
}

/** Daily safety bound: at most 20 claim rounds × 10 tasks per pipeline run. */
const MAX_CLAIM_ROUNDS = 20;
const CLAIM_BATCH = 10;

export interface PipelineDeps {
  db: SupabaseClient;
  limit?: number;
}

function defaultDeps(): PipelineDeps {
  return { db: supabaseAdmin };
}

/** Process one claimed task. Pure decision logic, completion is the caller's job. */
export async function processAgentTask(task: AgentTask, _deps: PipelineDeps = defaultDeps()): Promise<{ status: 'SUCCEEDED' | 'WAITING_APPROVAL'; result: Record<string, unknown> }> {
  if (task.type === 'APPLICATION') {
    // Controlled automatic submission (Phase 8). Every gate; the global kill
    // switch, the per-user pause, APPROVED state, entitlement, supported site
    // adapter, truthfulness; is re-checked server-side inside the processor
    // before any browser is touched. With the kill switch absent (default),
    // this returns WAITING_APPROVAL and nothing is ever sent.
    return processApplicationTask((task.payload ?? {}) as Record<string, unknown>);
  }
  if (task.type === 'JOB_DISCOVERY') {
    // Per-user discovery (2026-09-21). Legacy shared-pool rows without a
    // user_id still complete as no-ops so nothing blocks the drain loop.
    if (!task.user_id) return { status: 'SUCCEEDED', result: { skipped: 'discovery_legacy_no_user' } };
    const outcome = await runDiscoveryForUser(task.user_id, undefined, { db: _deps.db });
    return { status: 'SUCCEEDED', result: { ...outcome } };
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
  tasksProcessed: number;
  taskOutcomes: { id: string; type: string; status: string }[];
  errors: string[];
  /** Per-user discovery stage (runs before task draining so auto-mode
   *  applications created by discovery are submitted in the same run). */
  discovery?: Awaited<ReturnType<typeof runDiscoveryStage>>;
  /** Milestone 2 credit ledger: number of period grants issued this run
   *  (parallel-run phase; enforcement is armed separately). */
  creditGrants?: number;
}

/**
 * The daily cycle: claim + process due tasks until drained. Application
 * tasks run the autopilot apply agent under every server-side gate.
 * Idempotent by design (safe if Vercel double-fires or we invoke manually).
 */
export async function runDailyPipeline(partial: Partial<PipelineDeps> = {}): Promise<PipelineReport> {
  const deps: PipelineDeps = { ...defaultDeps(), ...partial };
  const report: PipelineReport = { day: new Date().toISOString().slice(0, 10), tasksProcessed: 0, taskOutcomes: [], errors: [] };

  // Discovery first: paid users' agents find matching roles, craft packages,
  // and (auto send policy) enqueue APPLICATION tasks that the drain loop
  // below then submits in this same run.
  try {
    report.discovery = await runDiscoveryStage({ db: deps.db });
  } catch (error) {
    report.errors.push(`discovery: ${error instanceof Error ? error.message : 'DISCOVERY_FAILED'}`);
  }

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
