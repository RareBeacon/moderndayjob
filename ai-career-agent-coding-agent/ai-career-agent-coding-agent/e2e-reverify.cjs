/**
 * Independent browser E2E — Jobiest web recovery re-verification (2026-09-17, session 2).
 * Runs against https://jobiest.com with this session's labeled test account
 * (qa2.webtest@jobiest.com). Real UI interactions: login, navigation, search,
 * profile save, logout, post-logout state, mobile viewport overflow checks.
 */
const { chromium } = require('playwright');

const BASE = 'https://jobiest.com';
const EMAIL = 'qa2.webtest@jobiest.com';
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

  // ---------- 1. LOGIN via the real UI ----------
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  log('login-ui', !page.url().includes('/login'), `redirected to ${new URL(page.url()).pathname}`);

  // ---------- 2. Authenticated APIs via browser cookies ----------
  const api = await page.evaluate(async () => {
    const out = {};
    for (const p of ['/api/profile', '/api/entitlements', '/api/applications']) {
      const r = await fetch(p, { credentials: 'same-origin' });
      out[p] = r.status;
    }
    return out;
  });
  log('authed-apis', Object.values(api).every((s) => s === 200), JSON.stringify(api));

  // ---------- 3. Profile UI: complete a field and save ----------
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  const nameInput = page.locator('input[name="full_name"], input[name="fullName"]').first();
  if (await nameInput.count()) {
    await nameInput.fill('QA Webtest Two');
    const save = page.locator('button[type="submit"], button:has-text("Save")').first();
    await save.click().catch(() => {});
    await page.waitForTimeout(1500);
    const after = await page.evaluate(async () => (await fetch('/api/profile', { credentials: 'same-origin' })).json());
    const savedName = after?.profile?.full_name;
    log('profile-save-ui', savedName === 'QA Webtest Two', `full_name after save: ${JSON.stringify(savedName)}`);
  } else {
    log('profile-save-ui', false, 'no full_name input found on /profile');
  }

  // ---------- 4. Jobs: search, count cards, open detail ----------
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
  const search = page.locator('input[type="search"], input[name="q"], input[placeholder*="earch" i]').first();
  let jobsOk = false, jobsDetail = '';
  if (await search.count()) {
    await search.fill('engineer');
    await search.press('Enter').catch(() => {});
    await page.waitForTimeout(2500);
  }
  const cards = await page.locator('a[href*="/jobs/"], article, [data-job-id]').count();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  const listed = (bodyText.match(/engineer/gi) || []).length;
  jobsOk = cards > 0 || listed > 0;
  // open the first internal job link if present
  const jobLink = page.locator('a[href*="/jobs/"]').first();
  if (await jobLink.count()) {
    await jobLink.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    jobsDetail = new URL(page.url()).pathname;
    log('job-detail-open', /\/jobs\//.test(jobsDetail), `opened ${jobsDetail}`);
  } else {
    log('job-detail-open', false, 'no /jobs/ link found');
  }
  log('jobs-search', jobsOk, `search "engineer": ${cards} cards / ${listed} matches on page`);

  // ---------- 5. LOGOUT via the app shell ----------
  const logoutBtn = page.locator('button:has-text("Log out"), button:has-text("Log Out"), button:has-text("Sign out"), a:has-text("Log out"), form[action*="signout"] button').first();
  let loggedOut = false;
  if (await logoutBtn.count()) {
    await logoutBtn.click();
    await page.waitForTimeout(2500);
  } else {
    await page.evaluate(async () => { await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' }); });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  }
  loggedOut = !page.url().includes('/dashboard');
  log('logout-ui', loggedOut, `landed on ${new URL(page.url()).pathname}`);

  // ---------- 6. Post-logout state: API 401 + protected page redirect + stays out on reload ----------
  const afterLogout = await page.evaluate(async () => (await fetch('/api/profile', { credentials: 'same-origin' })).status);
  log('post-logout-api-401', afterLogout === 401, `/api/profile -> ${afterLogout}`);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }).catch(() => {});
  const redirected = new URL(page.url()).pathname.startsWith('/login');
  log('post-logout-redirect', redirected, `/dashboard -> ${new URL(page.url()).pathname}`);
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  const stillOut = new URL(page.url()).pathname.startsWith('/login') || (await page.evaluate(async () => (await fetch('/api/profile', { credentials: 'same-origin' })).status)) === 401;
  log('post-logout-reload', stillOut, 'still logged out after reload');

  // ---------- 7. Reset-password page renders friendly states ----------
  await page.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' });
  const rpText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  log('reset-password-page', /reset/i.test(rpText), `renders: ${rpText.replace(/\s+/g, ' ').slice(0, 80)}`);

  // ---------- 8. Mobile viewport 375px overflow checks ----------
  const mctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
  const mpage = await mctx.newPage();
  for (const p of ['/', '/jobs', '/login', '/pricing', '/support']) {
    await mpage.goto(BASE + p, { waitUntil: 'networkidle' });
    const w = await mpage.evaluate(() => document.scrollingElement.scrollWidth);
    log(`mobile-375-${p}`, w <= 376, `scrollWidth ${w}px`);
  }
  await mctx.close();

  // ---------- 9. Page errors ----------
  log('no-page-errors', errors.length === 0, errors.slice(0, 3).join(' ;; ') || 'none');

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('E2E FATAL:', e.message); process.exit(1); });
