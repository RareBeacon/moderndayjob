import http from 'node:http';
import { supabaseAdmin } from '../../lib/supabase';
import { claimTasks, completeTask, failTask, processAgentTask, type AgentTask } from '../../lib/agent/pipeline';
import { defaultAdapters } from '../../lib/jobsources/boards';
import { supabaseJobStore } from '../../lib/jobsources/store';

/**
 * Always-on agent worker (optional — local dev / a future paid host).
 * Production runs the same logic daily via Vercel Cron:
 * /api/cron/daily-pipeline. Both use lib/agent/pipeline.
 */

const POLL_MS = 5000;
const deps = { db: supabaseAdmin, adapters: defaultAdapters(), store: supabaseJobStore };

async function tick() {
  const tasks = await claimTasks(supabaseAdmin, 5, 120);
  for (const task of tasks as AgentTask[]) {
    try {
      const { status, result } = await processAgentTask(task, deps);
      await completeTask(supabaseAdmin, task, status, result);
    } catch (error) { await failTask(supabaseAdmin, task, error) }
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
