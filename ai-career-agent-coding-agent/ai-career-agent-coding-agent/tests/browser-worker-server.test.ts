import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrowserWorkerServer } from '../workers/browser/server';
import { submitViaBrowser } from '../lib/apply/client';
import type { Browser, BrowserContext, Page, Route } from 'playwright';
import type { ApplyCandidate } from '../lib/apply/types';

const openServers: http.Server[] = [];

function listen(server: http.Server): Promise<string> {
  openServers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : ''}`);
    });
  });
}

afterEach(async () => {
  delete process.env.BROWSER_WORKER_URL;
  delete process.env.BROWSER_WORKER_URLS;
  delete process.env.BROWSER_WORKER_SECRET;
  while (openServers.length) {
    const s = openServers.pop()!;
    await new Promise((r) => s.close(r));
  }
});

const publicLookup = async () => [{ address: '104.18.12.34', family: 4 }];

const baseCandidate: ApplyCandidate = {
  jobUrl: 'https://boards.greenhouse.io/acme/jobs/1',
  company: 'Acme',
  title: 'Engineer',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  phone: null,
  cvPath: '/tmp/fake-cv.pdf',
  cvDownloadUrl: null,
  coverLetter: 'Hello',
  answers: [],
};

function makeFakeBrowser(opts: {
  connected?: boolean;
  html?: string;
  present?: string[];
  throwOnGoto?: Error;
  throwAfterClick?: Error;
}): Browser {
  const present = new Set(
    opts.present ?? [
      'input[type="file"]',
      'button[type="submit"]',
      'input[name="job_application[first_name]"]',
      'input[name="job_application[last_name]"]',
      'input[name="job_application[email]"]',
    ],
  );
  let currentUrl = 'https://boards.greenhouse.io/acme/jobs/1';
  const html =
    opts.html ??
    '<form><input type="file"/><button type="submit">Submit</button></form><p>Thank you for applying!</p>';

  const page = {
    url: () => currentUrl,
    title: async () => 'Confirmation',
    content: async () => html,
    route: async (_pattern: string, _handler: (route: Route) => Promise<void>) => {},
    goto: async (u: string) => {
      if (opts.throwOnGoto) throw opts.throwOnGoto;
      currentUrl = u;
    },
    locator: (sel: string) => ({
      count: async () =>
        sel
          .split(',')
          .map((s) => s.trim())
          .some((s) => present.has(s))
          ? 1
          : 0,
      first: () => ({
        fill: async () => {},
        check: async () => {},
        click: async () => {
          if (opts.throwAfterClick) throw opts.throwAfterClick;
        },
        setInputFiles: async () => {},
        selectOption: async () => {},
      }),
    }),
  } as unknown as Page;

  const context = {
    newPage: async () => page,
  } as unknown as BrowserContext;

  return {
    isConnected: () => opts.connected ?? true,
    newContext: async () => context,
    close: async () => {},
  } as unknown as Browser;
}

describe('Browser worker HTTP server error-reporting & failover contract', () => {
  it('returns 503 on /healthz when the Chromium binary is missing and 200 when ready', async () => {
    const broken = await listen(
      createBrowserWorkerServer({ secret: () => 's3cret', checkBrowserReady: () => false }),
    );
    const healthy = await listen(
      createBrowserWorkerServer({ secret: () => 's3cret', checkBrowserReady: () => true }),
    );

    const r1 = await fetch(`${broken}/healthz`);
    expect(r1.status).toBe(503);
    expect(await r1.json()).toMatchObject({ ok: false, error: 'BROWSER_BINARY_MISSING' });

    const r2 = await fetch(`${healthy}/healthz`);
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ ok: true, worker: 'browser' });
  });

  it('returns 400 (not 200) on malformed JSON body and 401 on missing secret', async () => {
    const url = await listen(
      createBrowserWorkerServer({ secret: () => 's3cret', checkBrowserReady: () => true }),
    );

    const unauth = await fetch(`${url}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(unauth.status).toBe(401);

    const badJson = await fetch(`${url}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer s3cret' },
      body: '{not-valid-json',
    });
    expect(badJson.status).toBe(400);
  });

  it('keeps legitimate SSRF and allowlist rejections as HTTP 200 STOP (never retryable)', async () => {
    const url = await listen(
      createBrowserWorkerServer({
        secret: () => 's3cret',
        checkBrowserReady: () => true,
        lookup: publicLookup,
      }),
    );

    const ssrf = await fetch(`${url}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer s3cret' },
      body: JSON.stringify({
        jobUrl: 'http://169.254.169.254/latest/meta-data/',
        allowedDomains: ['169.254.169.254'],
        candidate: baseCandidate,
      }),
    });
    expect(ssrf.status).toBe(200);
    expect(await ssrf.json()).toEqual({
      outcome: 'STOP',
      code: 'POLICY_RESTRICTED',
      message: 'SSRF_BLOCKED',
    });
  });

  it('returns HTTP 503 retryable=true when Chromium fails to launch (never disguised as HTTP 200 STOP)', async () => {
    const url = await listen(
      createBrowserWorkerServer({
        secret: () => 's3cret',
        checkBrowserReady: () => true,
        lookup: publicLookup,
        materializeCv: async () => null,
        launchBrowser: async () => {
          throw new Error("browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1243");
        },
      }),
    );

    const res = await fetch(`${url}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer s3cret' },
      body: JSON.stringify({
        jobUrl: baseCandidate.jobUrl,
        allowedDomains: ['boards.greenhouse.io'],
        candidate: baseCandidate,
      }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      error: 'BROWSER_LAUNCH_FAILED',
      retryable: true,
    });
  });

  it('fails over from a 503 browser-launch failure on primary to the healthy secondary worker', async () => {
    const primary = await listen(
      createBrowserWorkerServer({
        secret: () => 's3cret',
        checkBrowserReady: () => true,
        lookup: publicLookup,
        materializeCv: async () => null,
        launchBrowser: async () => {
          throw new Error('spawn ENOENT chromium');
        },
      }),
    );
    const secondary = await listen(
      createBrowserWorkerServer({
        secret: () => 's3cret',
        checkBrowserReady: () => true,
        lookup: publicLookup,
        materializeCv: async () => null,
        launchBrowser: async () => makeFakeBrowser({}),
      }),
    );

    process.env.BROWSER_WORKER_URLS = `${primary}, ${secondary}`;
    process.env.BROWSER_WORKER_SECRET = 's3cret';

    const outcome = await submitViaBrowser({
      jobUrl: baseCandidate.jobUrl,
      allowedDomains: ['boards.greenhouse.io'],
      candidate: baseCandidate,
    });
    expect(outcome).toMatchObject({ outcome: 'SUBMITTED' });
  });

  it('preserves B-186: post-click errors return HTTP 200 UNKNOWN and NEVER fail over to double-submit', async () => {
    let secondaryCalled = false;
    const primary = await listen(
      createBrowserWorkerServer({
        secret: () => 's3cret',
        checkBrowserReady: () => true,
        lookup: publicLookup,
        materializeCv: async () => null,
        launchBrowser: async () =>
          makeFakeBrowser({ throwAfterClick: new Error('Target page crashed right after click') }),
      }),
    );
    const secondary = await listen(
      createBrowserWorkerServer({
        secret: () => 's3cret',
        checkBrowserReady: () => true,
        lookup: publicLookup,
        materializeCv: async () => null,
        launchBrowser: async () => {
          secondaryCalled = true;
          return makeFakeBrowser({});
        },
      }),
    );

    process.env.BROWSER_WORKER_URLS = `${primary}, ${secondary}`;
    process.env.BROWSER_WORKER_SECRET = 's3cret';

    const outcome = await submitViaBrowser({
      jobUrl: baseCandidate.jobUrl,
      allowedDomains: ['boards.greenhouse.io'],
      candidate: baseCandidate,
    });
    expect(outcome).toMatchObject({ outcome: 'UNKNOWN', code: 'VERIFY_SIGNAL_MISSING' });
    expect(secondaryCalled).toBe(false);
  });
});
