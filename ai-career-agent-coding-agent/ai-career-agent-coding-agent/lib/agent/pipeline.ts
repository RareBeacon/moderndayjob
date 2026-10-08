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
    // this returns WAITING_APPROVAL and nothing is ever sent. The task id
    // rides along so the credit ledger can key holds per attempt.
    return processApplicationTask((task.payload ?? {}) as Record<string, unknown>, task.id);
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
  /** Subscription bookkeeping (migration 043): expired periods marked and
   *  due scheduled admin grants applied. Paid ACCESS never depends on this
   *  sweep: effective_plan already checks expiry at read time. */
  subscriptionsExpired?: { userId: string; plan: string }[];
  scheduledGrantsApplied?: { userId: string; plan: string }[];
}

/**
 * Subscription maintenance (spec Part 23). Runs inside the daily pipeline:
 *   1. mark ACTIVE_* subscriptions whose period ended as EXPIRED (+history),
 *   2. apply due scheduled admin grants (queued "after current subscription"),
 *   3. notify the affected users in-app (best-effort).
 * The RPCs are missing before migration 043 is applied; the step then reports
 * empty arrays instead of failing the pipeline.
 */
async function runSubscriptionMaintenance(deps: PipelineDeps): Promise<Pick<PipelineReport, 'subscriptionsExpired' | 'scheduledGrantsApplied' | 'errors'>> {
  const out: Pick<PipelineReport, 'subscriptionsExpired' | 'scheduledGrantsApplied' | 'errors'> = {
    subscriptionsExpired: [],
    scheduledGrantsApplied: [],
    errors: [],
  };
  const notify = async (userId: string, title: string, body: string, type: string) => {
    try {
      await deps.db.from('notifications').insert({ user_id: userId, title, body, deep_link: '/billing', type });
    } catch {
      // Best-effort: never fails the sweep.
    }
  };

  try {
    const { data: expired, error } = await deps.db.rpc('expire_due_subscriptions');
    if (error) throw error;
    for (const row of (expired ?? []) as Array<{ o_user_id: string; o_plan: string }>) {
      out.subscriptionsExpired!.push({ userId: row.o_user_id, plan: row.o_plan });
      const planName = row.o_plan === 'MAX' ? 'Max' : row.o_plan === 'PREMIUM' ? 'Premium' : 'Basic';
      await notify(
        row.o_user_id,
        'Your plan has expired',
        `Your Jobiest ${planName} plan has ended. Your account is back on Free. Upgrade again any time to keep the daily credits and automation running.`,
        'SUBSCRIPTION_EXPIRED',
      );
    }
  } catch (error) {
    out.errors.push(`subscriptions-expiry: ${error instanceof Error ? error.message : 'FAILED'}`);
  }

  try {
    const { data: applied, error } = await deps.db.rpc('apply_due_scheduled_changes');
    if (error) throw error;
    for (const row of (applied ?? []) as Array<{ o_user_id: string; o_plan: string }>) {
      out.scheduledGrantsApplied!.push({ userId: row.o_user_id, plan: row.o_plan });
      const planName = row.o_plan === 'MAX' ? 'Max' : row.o_plan === 'PREMIUM' ? 'Premium' : 'Basic';
      await notify(
        row.o_user_id,
        `Your ${planName} upgrade is active`,
        `Your queued Jobiest upgrade is now live: you are on ${planName}. Enjoy the daily credits and automation.`,
        'SUBSCRIPTION_UPGRADED',
      );
    }
  } catch (error) {
    out.errors.push(`subscriptions-scheduled: ${error instanceof Error ? error.message : 'FAILED'}`);
  }

  return out;
}

/**
 * The daily cycle: claim + process due tasks until drained. Application
 * tasks run the autopilot apply agent under every server-side gate.
 * Idempotent by design (safe if Vercel double-fires or we invoke manually).
 */
export async function runDailyPipeline(partial: Partial<PipelineDeps> = {}): Promise<PipelineReport> {
  const deps: PipelineDeps = { ...defaultDeps(), ...partial };
  const report: PipelineReport = { day: new Date().toISOString().slice(0, 10), tasksProcessed: 0, taskOutcomes: [], errors: [] };

  // Subscription bookkeeping first (expiry + due scheduled grants). Access
  // control itself never depends on this: effective_plan is checked on read.
  const maintenance = await runSubscriptionMaintenance(deps);
  report.subscriptionsExpired = maintenance.subscriptionsExpired;
  report.scheduledGrantsApplied = maintenance.scheduledGrantsApplied;
  report.errors.push(...maintenance.errors);

  // Milestone 2 credit ledger: open due periods and issue their grants FIRST.
  // Without this, credit_reserve() finds no grants and every document
  // generation is refused with CREDIT_EXHAUSTED while the ledger is armed.
  // Wrapped so a grants failure never stops the task drain below.
  try {
    report.creditGrants = await ensurePeriodGrants();
  } catch (error) {
    report.errors.push(`credit-grants: ${error instanceof Error ? error.message : 'GRANTS_FAILED'}`);
  }

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
