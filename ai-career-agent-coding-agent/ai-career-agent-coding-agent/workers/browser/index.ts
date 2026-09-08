import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { assertSafeNavigation } from '../../lib/agent/ssrf';
import { detectApplyAdapter } from '../../lib/apply/registry';
import { runApply } from '../../lib/apply/engine';
import type { ApplyCandidate, ApplyOutcome, ApplyPage } from '../../lib/apply/types';

/**
 * Isolated browser worker (Phase 8). Runs ONLY on the dedicated Render browser
 * service (BROWSER_WORKER_URL), never inside the Vercel/web runtime. No
 * database master credentials live here — it receives a pre-built candidate
 * payload over HTTP and returns an ApplyOutcome.
 *
 * Security (SECURITY_ARCHITECTURE §Browser automation):
 *  - every navigation is SSRF-checked BEFORE the request AND re-checked per
 *    request via page.route (redirects can't slip past the guard);
 *  - a fresh, isolated context per submission — no cookies/storage shared
 *    between users;
 *  - the CV is materialised from a signed URL into a temp file and removed
 *    after the run.
 */

const PORT = Number(process.env.WORKER_PORT ?? 8082);

/** Bind a Playwright page to the fakeable ApplyPage contract. */
function bindPage(page: import('playwright').Page): ApplyPage {
  return {
    url: () => page.url(),
    title: async () => await page.title(),
    content: async () => await page.content(),
    has: async (sel) => (await page.locator(sel).count()) > 0,
    fill: async (sel, val) => { await page.locator(sel).first().fill(val); },
    check: async (sel) => { await page.locator(sel).first().check(); },
    click: async (sel) => { await page.locator(sel).first().click({ timeout: 15_000 }); },
    setInputFiles: async (sel, files) => { await page.locator(sel).first().setInputFiles(files); },
    selectOption: async (sel, val) => { await page.locator(sel).first().selectOption(val); },
    goto: async (url) => { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }); },
  };
}

async function materializeCv(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const path = `${os.tmpdir()}/jobiest-cv-${crypto.randomUUID()}.pdf`;
    await fs.writeFile(path, buf);
    return path;
  } catch {
    return null;
  }
}

interface SubmitBody {
  jobUrl: string;
  allowedDomains: string[];
  candidate: ApplyCandidate;
}

async function handleSubmit(body: SubmitBody): Promise<ApplyOutcome> {
  // Re-verify the job URL before any browser work.
  await assertSafeNavigation(body.jobUrl, body.allowedDomains);

  const adapter = detectApplyAdapter(body.jobUrl);
  if (!adapter) {
    return {
      outcome: 'STOP',
      code: 'UNSUPPORTED_PLATFORM',
      message: 'This employer platform is not supported for automatic submission.',
    };
  }

  const cvPath = await materializeCv(body.candidate.cvDownloadUrl);
  const candidate: ApplyCandidate = { ...body.candidate, cvPath: cvPath ?? body.candidate.cvPath };

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(); // isolated: no shared cookies/storage
    const page = await context.newPage();

    // Per-request SSRF re-check: abort any navigation/request that fails.
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.isNavigationRequest()) {
        try {
          await assertSafeNavigation(request.url(), body.allowedDomains);
          return route.continue();
        } catch {
          return route.abort();
        }
      }
      return route.continue();
    });

    return await runApply(bindPage(page), candidate, adapter);
  } finally {
    await browser.close();
    if (cvPath) await fs.rm(cvPath, { force: true }).catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, worker: 'browser', at: new Date().toISOString() }));
    return;
  }
  if (req.method === 'POST' && req.url === '/submit') {
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SubmitBody;
      if (!body.jobUrl || !body.candidate || !Array.isArray(body.allowedDomains)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ outcome: 'STOP', code: 'POLICY_RESTRICTED', message: 'Invalid submit payload.' }));
        return;
      }
      const outcome = await handleSubmit(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(outcome));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BROWSER_ERROR';
      const code = ['SSRF_BLOCKED', 'DOMAIN_NOT_ALLOWLISTED', 'UNSUPPORTED_URL_SCHEME'].includes(message) ? 'POLICY_RESTRICTED' : 'POLICY_RESTRICTED';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ outcome: 'STOP', code, message }));
    }
    return;
  }
  res.writeHead(404).end();
});

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
