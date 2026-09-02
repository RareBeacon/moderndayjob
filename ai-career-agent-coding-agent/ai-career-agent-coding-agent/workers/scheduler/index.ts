import http from 'node:http';
import { supabaseAdmin } from '../../lib/supabase';

const INTERVAL_MS = 60_000;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const { data, error } = await supabaseAdmin.rpc('enqueue_daily_discovery', { p_day: new Date().toISOString().slice(0, 10) });
    if (error) throw error;
    if (Number(data) > 0) {
      console.log(JSON.stringify({ event: 'daily_discovery_enqueued', created: data, at: new Date().toISOString() }));
    }
  } finally { running = false; }
}

/* Health endpoint + graceful shutdown (Phase 8 completion). */
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, worker: 'scheduler', at: new Date().toISOString() })); }
  else { res.writeHead(404).end(); }
});
let timer: ReturnType<typeof setInterval> | null = null;

async function main() {
  const port = Number(process.env.WORKER_PORT ?? 8080);
  server.listen(port, '0.0.0.0');
  console.log(JSON.stringify({ event: 'scheduler_worker_online', port }));
  await tick().catch((e) => console.error(JSON.stringify({ event: 'scheduler_error', error: String(e) })));
  timer = setInterval(() => { void tick().catch((e) => console.error(JSON.stringify({ event: 'scheduler_error', error: String(e) }))); }, INTERVAL_MS);
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
