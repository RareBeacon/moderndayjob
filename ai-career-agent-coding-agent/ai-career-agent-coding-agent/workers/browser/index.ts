import { createBrowserWorkerServer } from './server';

/**
 * Isolated browser worker entrypoint (Phase 8).
 * Runs ONLY on the isolated worker hosts (Oracle Always Free primary / Render
 * standby), never inside the Vercel/web runtime. No database credentials live
 * here; it receives a pre-built candidate payload over HTTP and returns an
 * ApplyOutcome (or HTTP 503 on genuine pre-submit browser launch/crash errors
 * so failover can safely route to a healthy worker).
 */

const PORT = Number(process.env.PORT ?? process.env.WORKER_PORT ?? 8082);
const server = createBrowserWorkerServer();

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'browser_worker_online', port: PORT }));
});

function shutdown() {
  console.log(JSON.stringify({ event: 'browser_worker_shutdown' }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
