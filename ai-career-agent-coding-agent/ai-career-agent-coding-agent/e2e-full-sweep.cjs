/**
 * Pass-5 full-surface UI/UX sweep — Jobiest web recovery (2026-09-17).
 * Visits EVERY page route: desktop 1280x800 (all) + mobile 375x700 (public),
 * capturing page errors, console errors, horizontal overflow, redirect
 * behavior, and checks every internal link for dead links (404s).
 */
const { chromium } = require('playwright');

const BASE = 'https://jobiest.com';
const EMAIL = 'qa2.webtest@jobiest.com';
const PW = process.env.E2E_PW;

const PUBLIC = ['/', '/about', '/blog', '/help', '/help/getting-started', '/how-it-works',
  '/jobs', '/login', '/pricing', '/privacy', '/refund', '/signup', '/support', '/terms',
  '/tools', '/offline', '/reset-password', '/verify-email', '/mfa-verify',
  '/free-ats-resume-scanner', '/free-career-path-explorer', '/free-cover-letter-writer',
  '/free-follow-up-email-writer', '/free-interview-question-generator',
  '/free-job-description-analyzer', '/free-linkedin-headline-builder',
  '/free-resume-summary-generator', '/free-salary-insights', '/free-skills-matcher'];
const AUTHED = ['/dashboard', '/applications', '/billing', '/billing/cancel', '/billing/success',
  '/documents', '/generate', '/match', '/onboarding', '/profile', '/profile/ai', '/settings'];
const ADMIN = ['/admin/credentials', '/admin/security', '/admin/seo', '/admin/usage', '/admin/users'];

function log(step, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${step} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(e.message));

  // login once
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  log('login', true, new URL(page.url()).pathname);

  const links = new Set();
  async function visit(path, { mobile = false, expectAuth = true } = {}) {
    const label = `${mobile ? 'm375' : 'desk'} ${path}`;
    try {
      const errBefore = pageErrs.length;
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1800);
      const finalPath = new URL(page.url()).pathname;
      // collect internal links
      if (!mobile) {
        const hrefs = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'))
            .map((a) => a.getAttribute('href'))
            .filter((h) => h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:') && !h.startsWith('http')));
        hrefs.forEach((h) => {
          try { links.add(new URL(h, BASE).pathname.split('?')[0]); } catch {}
        });
      }
      const sw = await page.evaluate(() => document.scrollingElement.scrollWidth);
      const h1 = await page.locator('h1').count().catch(() => 0);
      const errs = pageErrs.slice(errBefore);
      const redirectedAway = finalPath !== path;
      const overflow = sw > (mobile ? 376 : 1281);
      const ok = !overflow && errs.length === 0 && (expectAuth ? !redirectedAway : true);
      log(label, ok, `w=${sw}${overflow ? ' OVERFLOW' : ''}${redirectedAway ? ` ->${finalPath}` : ''} h1=${h1}${errs.length ? ' ERRORS:' + errs[0].slice(0, 90) : ''}`);
    } catch (e) {
      log(label, false, `EXCEPTION ${e.message.slice(0, 90)}`);
    }
  }

  console.log('--- public routes: desktop ---');
  for (const p of PUBLIC) await visit(p);
  console.log('--- public routes: mobile 375 (dedicated context, anonymous) ---');
  const mctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
  const mpage = await mctx.newPage();
  const merrs = [];
  mpage.on('pageerror', (e) => merrs.push(e.message));
  for (const p of PUBLIC) {
    const label = 'm375 ' + p;
    try {
      const before = merrs.length;
      await mpage.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await mpage.waitForTimeout(1500);
      const w = await mpage.evaluate(() => document.scrollingElement.scrollWidth);
      const ok = w <= 376 && merrs.length === before;
      log(label, ok, 'w=' + w + (w > 376 ? ' OVERFLOW' : '') + (merrs.length > before ? ' ERR:' + merrs[before].slice(0, 60) : ''));
    } catch (e) { log(label, false, 'EXC ' + e.message.slice(0, 70)); }
  }
  await mctx.close();
  console.log('--- authenticated routes: desktop (logged in) ---');
  for (const p of AUTHED) await visit(p, { expectAuth: true });
  console.log('--- admin routes as NON-admin: expect redirect/404, never content ---');
  for (const p of ADMIN) {
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
    const leak = /user list|admin console|all users|suspend|terminate/i.test(body);
    log(`admin ${p}`, !leak, `final=${new URL(page.url()).pathname} leak=${leak}`);
  }

  console.log('--- internal link check (' + links.size + ' unique) ---');
  const dead = [];
  const results = await page.evaluate(async (paths) => {
    const out = [];
    for (const p of paths) {
      try {
        const r = await fetch(p, { credentials: 'same-origin' });
        out.push([p, r.status]);
      } catch (e) { out.push([p, 'ERR']); }
    }
    return out;
  }, Array.from(links));
  for (const [p, s] of results) if (s === 404 || s === 500 || s === 'ERR') dead.push(`${p}->${s}`);
  log('dead-links', dead.length === 0, dead.length ? dead.slice(0, 12).join(' , ') : `${results.length} links, 0 dead (200/307/other-ok)`);

  await browser.close();
  console.log('SWEEP DONE');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
