import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitViaBrowser } from '@/lib/apply/client';
import type { ApplyCandidate } from '@/lib/apply/types';

/**
 * Browser-worker client (Phase 9). The web app never launches a browser; it
 * POSTs the pre-built candidate to the isolated worker and treats ANY failure
 * (unconfigured, non-2xx, network error) as a safe STOP — automation must
 * never blow up a request, and must never retry storm on a config problem.
 */

const candidate: ApplyCandidate = {
  jobUrl: 'https://boards.greenhouse.io/acme/jobs/1',
  company: 'Acme',
  title: 'Engineer',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  phone: null,
  cvPath: null,
  cvDownloadUrl: null,
  coverLetter: null,
  answers: [],
};

const req = { jobUrl: candidate.jobUrl, allowedDomains: ['boards.greenhouse.io'], candidate };

/** Narrow the ApplyOutcome union to the STOP branch for property assertions. */
function asStop(r: { outcome: 'SUBMITTED'; confirmation: string; url: string } | { outcome: 'STOP'; code: string; message: string }) {
  if (r.outcome !== 'STOP') throw new Error(`expected STOP, got ${r.outcome}`);
  return r;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BROWSER_WORKER_URL;
  delete process.env.BROWSER_WORKER_URLS;
  delete process.env.BROWSER_WORKER_SECRET;
});

describe('submitViaBrowser', () => {
  it('stops safely when the worker URL is not configured', async () => {
    delete process.env.BROWSER_WORKER_URL;
    const s = asStop(await submitViaBrowser(req));
    expect(s.code).toBe('POLICY_RESTRICTED');
  });

  it('POSTs to <base>/submit with the payload, no auth header when no secret', async () => {
    process.env.BROWSER_WORKER_URL = 'https://worker.example.com/';
    delete process.env.BROWSER_WORKER_SECRET;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ outcome: 'SUBMITTED', confirmation: 'thanks', url: candidate.jobUrl }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await submitViaBrowser(req);
    expect(r.outcome).toBe('SUBMITTED');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://worker.example.com/submit'); // trailing slash stripped
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers.authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual(req);
  });

  it('sends the Bearer secret when configured', async () => {
    process.env.BROWSER_WORKER_URL = 'https://worker.example.com';
    process.env.BROWSER_WORKER_SECRET = 's3cret';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ outcome: 'SUBMITTED' }) });
    vi.stubGlobal('fetch', fetchMock);

    await submitViaBrowser(req);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer s3cret');
  });

  it('maps a non-2xx worker response to a safe STOP', async () => {
    process.env.BROWSER_WORKER_URL = 'https://worker.example.com';
    process.env.BROWSER_WORKER_SECRET = 's3cret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const s = asStop(await submitViaBrowser(req));
    expect(s.code).toBe('POLICY_RESTRICTED');
    expect(s.message).toMatch(/401/);
  });

  it('maps a network failure to a safe STOP', async () => {
    process.env.BROWSER_WORKER_URL = 'https://worker.example.com';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const s = asStop(await submitViaBrowser(req));
    expect(s.message).toMatch(/unreachable/);
  });
});

describe('submitViaBrowser failover (BROWSER_WORKER_URLS)', () => {
  it('submits to the primary when it is healthy', async () => {
    process.env.BROWSER_WORKER_URLS = 'https://primary.example.com, https://backup.example.com/';
    process.env.BROWSER_WORKER_SECRET = 's3cret';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/healthz')) return { ok: true } as Response;
      return { ok: true, json: async () => ({ outcome: 'SUBMITTED' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await submitViaBrowser(req);
    expect(r.outcome).toBe('SUBMITTED');
    const submitCalls = fetchMock.mock.calls.map((c) => c[0]).filter((u) => u.endsWith('/submit'));
    expect(submitCalls).toEqual(['https://primary.example.com/submit']);
  });

  it('skips an unhealthy primary and submits to the healthy standby', async () => {
    process.env.BROWSER_WORKER_URLS = 'https://primary.example.com, https://backup.example.com';
    process.env.BROWSER_WORKER_SECRET = 's3cret';
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://primary.example.com/healthz') return { ok: false, status: 500 } as Response;
      if (url === 'https://backup.example.com/healthz') return { ok: true } as Response;
      if (url.endsWith('/submit')) {
        return { ok: true, json: async () => ({ outcome: 'SUBMITTED' }) } as Response;
      }
      throw new Error('unexpected url ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await submitViaBrowser(req);
    expect(r.outcome).toBe('SUBMITTED');
    const submitCalls = fetchMock.mock.calls.map((c) => c[0]).filter((u) => u.endsWith('/submit'));
    expect(submitCalls).toEqual(['https://backup.example.com/submit']);
  });

  it('falls through to the standby when the primary dies mid-submit', async () => {
    process.env.BROWSER_WORKER_URLS = 'https://primary.example.com, https://backup.example.com';
    process.env.BROWSER_WORKER_SECRET = 's3cret';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/healthz')) return { ok: true } as Response;
      if (url === 'https://primary.example.com/submit') throw new Error('ECONNRESET');
      if (url === 'https://backup.example.com/submit') {
        return { ok: true, json: async () => ({ outcome: 'SUBMITTED' }) } as Response;
      }
      throw new Error('unexpected url ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await submitViaBrowser(req);
    expect(r.outcome).toBe('SUBMITTED');
    const submitCalls = fetchMock.mock.calls.map((c) => c[0]).filter((u) => u.endsWith('/submit'));
    expect(submitCalls).toEqual(['https://primary.example.com/submit', 'https://backup.example.com/submit']);
  });

  it('treats an auth failure as terminal (no failover masking)', async () => {
    process.env.BROWSER_WORKER_URLS = 'https://primary.example.com, https://backup.example.com';
    process.env.BROWSER_WORKER_SECRET = 's3cret';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/healthz')) return { ok: true } as Response;
      return { ok: false, status: 401 } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const s = asStop(await submitViaBrowser(req));
    expect(s.message).toMatch(/401/);
    const submitCalls = fetchMock.mock.calls.map((c) => c[0]).filter((u) => u.endsWith('/submit'));
    expect(submitCalls).toEqual(['https://primary.example.com/submit']); // no retry on auth failure
  });

  it('stops safely when every worker is unreachable', async () => {
    process.env.BROWSER_WORKER_URLS = 'https://primary.example.com, https://backup.example.com';
    process.env.BROWSER_WORKER_SECRET = 's3cret';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const s = asStop(await submitViaBrowser(req));
    expect(s.message).toMatch(/unreachable/);
  });
});
