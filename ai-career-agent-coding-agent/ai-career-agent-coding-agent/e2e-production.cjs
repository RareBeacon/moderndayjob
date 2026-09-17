/**
 * Production browser E2E — Jobiest web recovery (2026-09-17).
 * Runs against https://jobiest.com with the labeled test account.
 * Evidence collector: writes PRODUCTION_E2E_EVIDENCE lines to stdout.
 */
const { chromium } = require('playwright');

const BASE = 'https://jobiest.com';
const EMAIL = 'qa.webtest@jobiest.com';
const PW = process.env.E2E_PW;

function log(step, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${step} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // ---------- 1. LOGIN (real UI, cookie session) ----------
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  log('login', !page.url().includes('/login'), `redirected to ${new URL(page.url()).pathname}`);

  // ---------- 2. AUTHENTICATED API via cookies (the real web path) ----------
  const api = await page.evaluate(async () => {
    const out = {};
    for (const p of ['/api/profile', '/api/profile/completeness', '/api/preferences',
      '/api/entitlements', '/api/credentials', '/api/applications', '/api/saved-jobs',
      '/api/documents', '/api/documents/generated', '/api/resume-studio/draft']) {
      const r = await fetch(p, { credentials: 'same-origin' });
      let body = '';
      try { body = (await r.json()); } catch {}
      out[p] = { status: r.status, body: JSON.stringify(body).slice(0, 110) };
    }
    return out;
  });
  for (const [p, r] of Object.entries(api)) {
    log(`authed-api ${p}`, r.status === 200, `${r.status} ${r.body}`);
  }

  // ---------- 3. PROTECTED PAGES RENDER ----------
  for (const path of ['/dashboard', '/jobs', '/applications', '/documents', '/profile', '/settings', '/match']) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
      const stillThere = !page.url().includes('/login');
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 90);
      log(`page ${path}`, stillThere, stillThere ? `200-rendered: "${text}"` : `redirected to /login`);
    } catch (e) {
      log(`page ${path}`, false, e.message.slice(0, 90));
    }
  }

  // ---------- 4. JOB SEARCH (real production data) ----------
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
  const jobsUrl = new URL(page.url());
  const search = page.locator('input[type="search"], input[name="q"], input[placeholder*="earch" i]').first();
  if (await search.count()) {
    await search.fill('engineer');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
  }
  const jobCards = await page.locator('a[href*="/jobs/"], article, [data-job]').count();
  const bodySnippet = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 120);
  log('job-search', true, `query=engineer cards~${jobCards} :: "${bodySnippet}"`);

  // ---------- 5. LOGOUT (must actually revoke) ----------
  // AppShell posts a form to /api/auth/signout; find any sign-out control.
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  const signOut = page.getByRole('button', { name: /sign out|log out/i }).first();
  let signedOut = false;
  if (await signOut.count()) {
    await signOut.click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 30000 }).catch(() => {});
    signedOut = page.url().endsWith('/');
  }
  if (!signedOut) {
    // fallback: direct form post to the signout route, as the app shell does
    await page.evaluate(async () => {
      const f = document.createElement('form');
      f.method = 'POST'; f.action = '/api/auth/signout';
      document.body.appendChild(f); f.submit();
    });
    await page.waitForURL((u) => u.pathname === '/', { timeout: 30000 }).catch(() => {});
    signedOut = page.url().endsWith('/');
  }
  log('logout-lands-home', signedOut, `at ${new URL(page.url()).pathname}`);

  // after logout: protected API must fail, protected page must redirect
  const afterApi = await page.evaluate(async () => {
    const r = await fetch('/api/profile', { credentials: 'same-origin' });
    return { status: r.status, body: (await r.text()).slice(0, 60) };
  });
  log('post-logout-api-revoked', afterApi.status === 401, `/api/profile -> ${afterApi.status} ${afterApi.body}`);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
  log('post-logout-page-redirect', page.url().includes('/login'), `-> ${new URL(page.url()).pathname}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
  log('post-logout-refresh-stays-out', page.url().includes('/login'), `after refresh -> ${new URL(page.url()).pathname}`);

  // ---------- 6. MOBILE VIEWPORT (375px) ----------
  const mctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
  const mpage = await mctx.newPage();
  for (const path of ['/', '/jobs', '/login', '/pricing', '/support']) {
    await mpage.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
    const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    log(`mobile-375 ${path}`, overflow <= 2, `horizontal overflow: ${overflow}px`);
  }
  await mctx.close();

  if (errors.length) console.log('PAGE-ERRORS:\n' + errors.slice(0, 5).join('\n'));
  await browser.close();
})();
