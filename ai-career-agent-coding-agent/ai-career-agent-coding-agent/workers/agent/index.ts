import http from 'node:http';
import { supabaseAdmin } from '../../lib/supabase';
import { defaultAdapters } from '../../lib/jobsources/boards';
import { runIngestion } from '../../lib/jobsources/ingest';
import { supabaseJobStore } from '../../lib/jobsources/store';

type Task = { id: string; user_id: string; type: string; lease_token: string; attempts: number; payload: Record<string, unknown> };
const POLL_MS = 5000;
/** Ingest at most once per window across all users' discovery tasks (upserts are idempotent anyway). */
const INGEST_FRESHNESS_MS = 6 * 60 * 60 * 1000;

async function complete(task: Task, status: string, result: Record<string, unknown>) {
  await supabaseAdmin.from('agent_tasks').update({ status, result, completed_at: new Date().toISOString(), lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', task.id).eq('lease_token', task.lease_token);
}
async function fail(task: Task, error: unknown) {
  const message = error instanceof Error ? error.message : 'TASK_FAILED';
  const retry = task.attempts < 3;
  await supabaseAdmin.from('agent_tasks').update({ status: retry ? 'QUEUED' : 'FAILED', last_error: message, next_attempt_at: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** task.attempts)).toISOString(), lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', task.id).eq('lease_token', task.lease_token);
}

/** True when the pool was ingested recently (skip duplicate work). */
async function poolIsFresh(): Promise<boolean> {
  const { data } = await supabaseAdmin.from('jobs').select('created_at').order('created_at', { ascending: false }).limit(1);
  const latest = (data ?? [])[0]?.created_at;
  return !!latest && Date.now() - new Date(latest).getTime() < INGEST_FRESHNESS_MS;
}

async function processTask(task: Task) {
  if (task.type === 'JOB_DISCOVERY') {
    if (await poolIsFresh()) {
      await complete(task, 'SUCCEEDED', { skipped: 'pool_already_fresh' });
      return;
    }
    const report = await runIngestion({ adapters: defaultAdapters(), store: supabaseJobStore });
    await complete(task, 'SUCCEEDED', { ingested: report.totalUpserted, sources: report.sources });
    return;
  }
  if (task.type === 'APPLICATION') {
    // Autonomous submission stays OFF until an approved site adapter,
    // browser isolation and the full security gate exist. Nothing sends
    // without explicit user approval.
    await complete(task, 'WAITING_APPROVAL', { reason: 'Automation is disabled until an approved site adapter and user approval are available.' });
    return;
  }
  await complete(task, 'SUCCEEDED', { message: 'No operation required.' });
}

async function tick() {
  const { data, error } = await supabaseAdmin.rpc('claim_agent_tasks', { p_limit: 5, p_lease_seconds: 120 });
  if (error) throw error;
  for (const task of (data ?? []) as Task[]) {
    try { await processTask(task) } catch (error) { await fail(task, error) }
  }
}

/* Health endpoint + graceful shutdown (Phase 8 completion). */
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, worker: 'agent', at: new Date().toISOString() })); }
  else { res.writeHead(404).end(); }
});
let timer: ReturnType<typeof setInterval> | null = null;

async function main() {
  const port = Number(process.env.WORKER_PORT ?? 8081);
  server.listen(port, '0.0.0.0');
  console.log(JSON.stringify({ event: 'agent_worker_online', port }));
  await tick().catch((e) => console.error(JSON.stringify({ event: 'agent_error', error: String(e) })));
  timer = setInterval(() => { void tick().catch((e) => console.error(JSON.stringify({ event: 'agent_error', error: String(e) }))); }, POLL_MS);
}

function shutdown() {
  console.log(JSON.stringify({ event: 'agent_worker_shutdown' }));
  if (timer) clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void main();
