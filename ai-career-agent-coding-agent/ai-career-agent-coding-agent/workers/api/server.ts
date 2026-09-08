import http from 'node:http';
import { isAuthorizedApiKey } from './auth';
import { createRateLimiter } from './rateLimit';

/**
 * Self-hosted API gateway (Oracle Always Free). A thin, fully-controlled
 * public API in front of the isolated browser worker:
 *
 *   GET  /healthz    — liveness (no auth).
 *   POST /v1/submit  — auth (Bearer API key) + per-key rate limit, then
 *                      forwards to BROWSER_WORKER_URL/submit with the worker
 *                      secret and a server-side domain allowlist.
 *
 * The gateway NEVER trusts client-supplied allowedDomains — it always sends
 * the canonical ATS allowlist, so a compromised key can't widen SSRF scope.
 * The worker still re-checks every navigation (SSRF + adapter match).
 */
export interface ApiGatewayOptions {
  apiKeys: string[];
  workerUrl: string;
  workerSecret: string;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  allowedDomains?: string[];
}

export const DEFAULT_ALLOWED_DOMAINS = [
  'greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'lever.co',
  'jobs.lever.co',
];

const JSON_HEADERS = { 'content-type': 'application/json' };

function send(res: http.ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(status, { ...JSON_HEADERS, ...extra });
  res.end(JSON.stringify(body));
}

export function createApiServer(opts: ApiGatewayOptions): http.Server {
  const keys = opts.apiKeys;
  const limiter = createRateLimiter(opts.rateLimitMax ?? 30, opts.rateLimitWindowMs ?? 60_000);
  const allowedDomains = opts.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS;
  const workerBase = opts.workerUrl.replace(/\/+$/, '');

  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      send(res, 200, { ok: true, service: 'jobiest-api-gateway', at: new Date().toISOString() });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/submit') {
      // 1. Auth — fail closed.
      if (!isAuthorizedApiKey(req.headers.authorization, keys)) {
        send(res, 401, { error: 'unauthorized', message: 'Missing or invalid API key.' });
        return;
      }
      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();

      // 2. Per-key rate limit.
      const decision = limiter.check(token || 'anon');
      if (!decision.allowed) {
        send(res, 429, { error: 'rate_limited', message: 'Too many requests. Slow down.' }, { 'retry-after': String(decision.retryAfterSec) });
        return;
      }

      // 3. Parse + validate the payload.
      let body: { jobUrl?: unknown; candidate?: unknown };
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        send(res, 400, { error: 'bad_request', message: 'Invalid JSON body.' });
        return;
      }
      if (typeof body?.jobUrl !== 'string' || !body.jobUrl || typeof body?.candidate !== 'object' || body.candidate === null) {
        send(res, 400, { error: 'bad_request', message: 'jobUrl (string) and candidate (object) are required.' });
        return;
      }

      // 4. Forward to the isolated browser worker (fail-closed on any error).
      try {
        const upstream = await fetch(`${workerBase}/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.workerSecret}` },
          body: JSON.stringify({ jobUrl: body.jobUrl, allowedDomains, candidate: body.candidate }),
          signal: AbortSignal.timeout(180_000),
        });
        const payload = await upstream.json().catch(() => ({}));
        send(res, upstream.ok ? 200 : 502, payload);
      } catch {
        send(res, 502, { outcome: 'STOP', code: 'POLICY_RESTRICTED', message: 'The submission worker is unreachable.' });
      }
      return;
    }

    res.writeHead(404).end();
  });
}
