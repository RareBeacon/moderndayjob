import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright';
import { assertSafeNavigation, type LookupFn } from '../../lib/agent/ssrf';
import { detectApplyAdapter } from '../../lib/apply/registry';
import { runApply } from '../../lib/apply/engine';
import { isAuthorizedHeader } from './auth';
import type { ApplyCandidate, ApplyOutcome, ApplyPage } from '../../lib/apply/types';

export interface SubmitBody {
  jobUrl: string;
  allowedDomains: string[];
  candidate: ApplyCandidate;
}

export interface BrowserWorkerDeps {
  secret?: () => string | undefined;
  checkBrowserReady?: () => boolean;
  launchBrowser?: () => Promise<Browser>;
  materializeCv?: (url: string | null) => Promise<string | null>;
  lookup?: LookupFn;
}

const POLICY_ERRORS = new Set([
  'SSRF_BLOCKED',
  'DOMAIN_NOT_ALLOWLISTED',
  'UNSUPPORTED_URL_SCHEME',
]);

/** Bind a Playwright page to ApplyPage while tracking whether submit was clicked. */
function bindPage(page: Page, onSubmitClick: () => void): ApplyPage {
  return {
    url: () => page.url(),
    title: async () => await page.title(),
    content: async () => await page.content(),
    has: async (sel) => (await page.locator(sel).count()) > 0,
    fill: async (sel, val) => {
      await page.locator(sel).first().fill(val);
    },
    check: async (sel) => {
      await page.locator(sel).first().check();
    },
    click: async (sel) => {
      onSubmitClick();
      await page.locator(sel).first().click({ timeout: 15_000 });
    },
    setInputFiles: async (sel, files) => {
      await page.locator(sel).first().setInputFiles(files);
    },
    selectOption: async (sel, val) => {
      await page.locator(sel).first().selectOption(val);
    },
    goto: async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    },
  };
}

export async function defaultMaterializeCv(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const filePath = `${os.tmpdir()}/jobiest-cv-${crypto.randomUUID()}.pdf`;
    await fsp.writeFile(filePath, buf);
    return filePath;
  } catch {
    return null;
  }
}

export function defaultCheckBrowserReady(): boolean {
  try {
    const execPath = chromium.executablePath();
    return Boolean(execPath) && fs.existsSync(execPath);
  } catch {
    return false;
  }
}

export async function defaultLaunchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function createBrowserWorkerServer(deps: BrowserWorkerDeps = {}): http.Server {
  const getSecret = deps.secret ?? (() => process.env.BROWSER_WORKER_SECRET);
  const checkReady = deps.checkBrowserReady ?? defaultCheckBrowserReady;
  const launchBrowser = deps.launchBrowser ?? defaultLaunchBrowser;
  const materializeCv = deps.materializeCv ?? defaultMaterializeCv;
  const lookup = deps.lookup;

  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      if (!checkReady()) {
        sendJson(res, 503, {
          ok: false,
          worker: 'browser',
          error: 'BROWSER_BINARY_MISSING',
          at: new Date().toISOString(),
        });
        return;
      }
      sendJson(res, 200, { ok: true, worker: 'browser', at: new Date().toISOString() });
      return;
    }

    if (req.method === 'POST' && req.url === '/submit') {
      if (!isAuthorizedHeader(req.headers.authorization, getSecret())) {
        sendJson(res, 401, {
          outcome: 'STOP',
          code: 'POLICY_RESTRICTED',
          message: 'Unauthorized: missing or invalid worker secret.',
        });
        return;
      }

      let body: SubmitBody;
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SubmitBody;
      } catch {
        sendJson(res, 400, {
          outcome: 'STOP',
          code: 'POLICY_RESTRICTED',
          message: 'Invalid submit payload.',
        });
        return;
      }

      if (
        !body ||
        typeof body.jobUrl !== 'string' ||
        !body.jobUrl ||
        !body.candidate ||
        typeof body.candidate !== 'object' ||
        !Array.isArray(body.allowedDomains)
      ) {
        sendJson(res, 400, {
          outcome: 'STOP',
          code: 'POLICY_RESTRICTED',
          message: 'Invalid submit payload.',
        });
        return;
      }

      // 1. Pre-flight SSRF & domain allowlist check BEFORE launching Chromium.
      try {
        await assertSafeNavigation(body.jobUrl, body.allowedDomains, lookup);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'SSRF_BLOCKED';
        sendJson(res, 200, {
          outcome: 'STOP',
          code: 'POLICY_RESTRICTED',
          message: POLICY_ERRORS.has(message) ? message : 'SSRF_BLOCKED',
        });
        return;
      }

      // 2. Supported ATS adapter check BEFORE launching Chromium.
      const adapter = detectApplyAdapter(body.jobUrl);
      if (!adapter) {
        sendJson(res, 200, {
          outcome: 'STOP',
          code: 'UNSUPPORTED_PLATFORM',
          message: 'This employer platform is not supported for automatic submission.',
        });
        return;
      }

      const cvPath = await materializeCv(body.candidate.cvDownloadUrl);
      const candidate: ApplyCandidate = {
        ...body.candidate,
        cvPath: cvPath ?? body.candidate.cvPath,
      };

      let browser: Browser | null = null;
      let submitClicked = false;
      try {
        let page: Page;
        try {
          browser = await launchBrowser();
          const context = await browser.newContext();
          page = await context.newPage();
          await page.route('**/*', async (route) => {
            const request = route.request();
            if (request.isNavigationRequest()) {
              try {
                await assertSafeNavigation(request.url(), body.allowedDomains, lookup);
                return route.continue();
              } catch {
                return route.abort();
              }
            }
            return route.continue();
          });
        } catch (launchErr) {
          const detail = launchErr instanceof Error ? launchErr.message.slice(0, 240) : 'LAUNCH_ERROR';
          console.error(JSON.stringify({ event: 'browser_worker_launch_failed', detail }));
          sendJson(res, 503, {
            error: 'BROWSER_LAUNCH_FAILED',
            retryable: true,
            message: 'The browser automation worker failed to launch Chromium.',
          });
          return;
        }

        try {
          const outcome: ApplyOutcome = await runApply(
            bindPage(page, () => {
              submitClicked = true;
            }),
            candidate,
            adapter,
            lookup ? { assertSafe: (u, allowed) => assertSafeNavigation(u, allowed, lookup) } : {},
          );
          sendJson(res, 200, outcome);
          return;
        } catch (runErr) {
          const rawMsg = runErr instanceof Error ? runErr.message : 'BROWSER_RUNTIME_ERROR';
          if (POLICY_ERRORS.has(rawMsg)) {
            sendJson(res, 200, { outcome: 'STOP', code: 'POLICY_RESTRICTED', message: rawMsg });
            return;
          }
          // B-186 invariant: once the submit click was initiated, NEVER mark
          // retryable (could double-submit on a secondary worker).
          if (submitClicked) {
            console.error(JSON.stringify({ event: 'browser_worker_post_click_error', detail: rawMsg.slice(0, 240) }));
            sendJson(res, 200, {
              outcome: 'UNKNOWN',
              code: 'VERIFY_SIGNAL_MISSING',
              message:
                'An unexpected browser error occurred while confirming submission. Nothing is retried automatically; please check the employer site.',
            });
            return;
          }
          const disconnected = browser ? !browser.isConnected() : true;
          console.error(
            JSON.stringify({
              event: disconnected ? 'browser_worker_crashed_pre_submit' : 'browser_worker_navigation_failed',
              detail: rawMsg.slice(0, 240),
            }),
          );
          if (disconnected) {
            sendJson(res, 503, {
              error: 'BROWSER_CRASHED_PRE_SUBMIT',
              retryable: true,
              message: 'The browser process terminated unexpectedly before submitting.',
            });
            return;
          }
          sendJson(res, 502, {
            error: 'TARGET_NAVIGATION_FAILED',
            retryable: false,
            message: 'The employer application page could not be loaded or interacted with.',
          });
          return;
        }
      } finally {
        if (browser) await browser.close().catch(() => {});
        if (cvPath) await fsp.rm(cvPath, { force: true }).catch(() => {});
      }
    }

    res.writeHead(404).end();
  });
}
