import http from 'node:http';
import { runDailyPipeline } from '../../lib/agent/pipeline';

/**
 * Local / self-hosted scheduler worker (companion to Vercel Cron).
 * Runs the shared daily pipeline on a fixed interval using the same
 * idempotent implementation as /api/cron/daily-pipeline.
 */

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function tick() {
  const report = await runDailyPipeline();
  console.log(
    JSON.stringify({
      event: 'scheduler_pipeline_complete',
      day: report.day,
      tasksProcessed: report.tasksProcessed,
      creditGrants: report.creditGrants ?? 0,
      errors: report.errors.length,
    }),
  );
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, worker: 'scheduler', at: new Date().toISOString() }));
  } else {
    res.writeHead(404).end();
  }
});

let timer: ReturnType<typeof setInterval> | null = null;

async function main() {
  const port = Number(process.env.SCHEDULER_PORT ?? 8083);
  const intervalMs = Math.max(60_000, Number(process.env.SCHEDULER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS));
  server.listen(port, '0.0.0.0');
  console.log(JSON.stringify({ event: 'scheduler_worker_online', port, intervalMs }));
  await tick().catch((e) => console.error(JSON.stringify({ event: 'scheduler_error', error: String(e) })));
  timer = setInterval(() => {
    void tick().catch((e) => console.error(JSON.stringify({ event: 'scheduler_error', error: String(e) })));
  }, intervalMs);
}

function shutdown() {
  console.log(JSON.stringify({ event: 'scheduler_worker_shutdown' }));
  if (timer) clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void main();
