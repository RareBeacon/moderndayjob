import { parseApiKeys } from './auth';
import { createApiServer } from './server';

/**
 * Self-hosted API gateway entrypoint (Oracle Always Free). Runs as a small,
 * always-on HTTP service next to the browser worker; the free load balancer /
 * Caddy terminates TLS and routes api.<domain>/… here.
 *
 * Env:
 *   PORT                    — listen port (default 8081; Render/Oracle inject).
 *   API_KEYS                — comma-separated customer API keys.
 *   BROWSER_WORKER_URL      — the isolated browser worker base URL.
 *   BROWSER_WORKER_SECRET   — shared secret for the worker's /submit.
 *   RATE_LIMIT_MAX          — requests per window per key (default 30).
 *   RATE_LIMIT_WINDOW_MS    — window length in ms (default 60000).
 */
const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 8081);

const workerUrl = process.env.BROWSER_WORKER_URL ?? '';
if (!workerUrl) {
  console.error(JSON.stringify({ event: 'api_gateway_config_missing', missing: 'BROWSER_WORKER_URL' }));
}

const server = createApiServer({
  apiKeys: parseApiKeys(process.env.API_KEYS),
  workerUrl,
  workerSecret: process.env.BROWSER_WORKER_SECRET ?? '',
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 30),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'api_gateway_online', port: PORT }));
});

function shutdown() {
  console.log(JSON.stringify({ event: 'api_gateway_shutdown' }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
