import http from 'node:http';
import { isAuthorizedHeader } from '../browser/auth';

/**
 * Self-hosted AI gateway (Oracle Always Free). Runs on the same compose
 * network as the Ollama container; Caddy terminates TLS for ai.<domain> and
 * routes traffic here. It enforces the shared Bearer secret in front of the
 * local model host so Ollama is never reachable from the internet (the UFW
 * rules on the VM only open 22/80/443; 11434 stays private to the network).
 *
 * Contract (consumed by packages/ai/providers.ts on the web app side):
 *  - GET  /healthz  : unauthenticated liveness probe (the app's /api/health
 *    pings this; it carries no key and expects a plain 200).
 *  - POST /api/chat : Ollama native chat protocol. The caller sends
 *    Authorization: Bearer <OLLAMA_API_KEY> (the same value the web app has
 *    in Vercel); the body and the JSON response are forwarded verbatim.
 *
 * No database credentials live here and the key is never logged.
 */
const PORT = Number(process.env.PORT ?? process.env.AI_PORT ?? 8083);
const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://ollama:11434').replace(/\/+$/, '');
const API_KEY = process.env.OLLAMA_API_KEY;

/** Forward a buffered request body to the internal Ollama container. */
async function forwardChat(body: Buffer): Promise<{ status: number; payload: Buffer | null }> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    // CPU-only inference is slow by design (measured ~2.5 tok/s on the A1
    // shape); never cut a generation off early on this hop.
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const payload = Buffer.from(await res.arrayBuffer());
  return { status: res.status, payload };
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'ai-gateway', at: new Date().toISOString() }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    // Shared-secret gate (fail closed): without a matching OLLAMA_API_KEY
    // nothing may reach the local model host. Timing-safe compare.
    if (!isAuthorizedHeader(req.headers.authorization, API_KEY)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      const { status, payload } = await forwardChat(body);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(payload);
    } catch (err) {
      console.error(JSON.stringify({ event: 'ai_gateway_forward_error', error: String(err).slice(0, 200) }));
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'BAD_GATEWAY' }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'NOT_FOUND' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'ai_gateway_online', port: PORT, upstream: OLLAMA_URL }));
});

function shutdown() {
  console.log(JSON.stringify({ event: 'ai_gateway_shutdown' }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
