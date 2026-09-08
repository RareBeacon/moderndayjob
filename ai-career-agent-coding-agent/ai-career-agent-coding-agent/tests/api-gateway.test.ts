import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { createApiServer } from '../workers/api/server';

/** Spin a server on an ephemeral port and return its base URL. */
function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : ''}`);
    });
  });
}

/** A fake isolated browser worker that records what it receives. */
function mockWorker() {
  const calls: { auth: string | undefined; body: unknown }[] = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/submit' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        calls.push({ auth: req.headers.authorization, body: JSON.parse(raw || '{}') });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ outcome: 'STOP', code: 'CAPTCHA', message: 'test' }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  return { server, calls };
}

describe('API gateway (Oracle Always Free)', () => {
  let worker = mockWorker();
  let workerUrl = '';
  let gateway: http.Server;
  let base = '';

  beforeAll(async () => {
    worker = mockWorker();
    workerUrl = await listen(worker.server);
    gateway = createApiServer({
      apiKeys: ['key-one', 'key-two'],
      workerUrl,
      workerSecret: 'worker-secret',
      rateLimitMax: 2,
      rateLimitWindowMs: 60_000,
    });
    base = await listen(gateway);
  });

  afterAll(async () => {
    await new Promise((r) => gateway.close(r));
    await new Promise((r) => worker.server.close(r));
  });

  it('serves /healthz without auth', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('jobiest-api-gateway');
  });

  it('rejects /v1/submit without an API key (401)', async () => {
    const res = await fetch(`${base}/v1/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobUrl: 'https://boards.greenhouse.io/x/jobs/1', candidate: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects /v1/submit with a wrong API key (401)', async () => {
    const res = await fetch(`${base}/v1/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer nope' },
      body: JSON.stringify({ jobUrl: 'https://boards.greenhouse.io/x/jobs/1', candidate: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed payload (400)', async () => {
    const res = await fetch(`${base}/v1/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer key-one' },
      body: JSON.stringify({ jobUrl: 'https://boards.greenhouse.io/x/jobs/1' }), // no candidate
    });
    expect(res.status).toBe(400);
  });

  it('forwards a valid request to the worker with the secret + server-side allowlist', async () => {
    const res = await fetch(`${base}/v1/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer key-one' },
      body: JSON.stringify({
        jobUrl: 'https://boards.greenhouse.io/x/jobs/1',
        allowedDomains: ['evil.example'], // client input must be ignored
        candidate: { email: 'a@b.com', name: 'Ada' },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: 'STOP', code: 'CAPTCHA' });

    expect(worker.calls).toHaveLength(1);
    expect(worker.calls[0].auth).toBe('Bearer worker-secret');
    const forwarded = worker.calls[0].body as { allowedDomains?: string[]; candidate?: unknown };
    // The gateway MUST replace client-supplied domains with the canonical allowlist.
    expect(forwarded.allowedDomains).not.toContain('evil.example');
    expect(forwarded.allowedDomains).toContain('boards.greenhouse.io');
  });

  it('rate-limits per key after the configured max (429)', async () => {
    const attempt = () =>
      fetch(`${base}/v1/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer key-two' },
        body: JSON.stringify({ jobUrl: 'https://jobs.lever.co/x/1', candidate: {} }),
      });
    // key-two has already used 0 requests in this window; allow 2, block the 3rd.
    await attempt(); // 1
    await attempt(); // 2
    const third = await attempt(); // 3 → 429
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBeTruthy();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
