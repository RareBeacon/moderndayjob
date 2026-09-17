const { chromium } = require('playwright');
const BASE = 'https://jobiest.com';
function log(s, ok, d) { console.log(`${ok ? 'PASS' : 'FAIL'} | ${s} | ${d}`); if (!ok) process.exitCode = 1; }
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'qa.webtest@jobiest.com');
  await page.fill('input[type="password"]', process.env.E2E_PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type="submit"]')]);
  const api = async (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, json: j, text: t.slice(0, 180) };
  }, { method, path, body });

  // AI agent endpoints with real cookie session (Journey B: AI agent)
  let r = await api('POST', '/api/ai/salary-insights', { role: 'Backend Engineer' });
  log('ai-salary-insights', r.status === 200, `${r.status} ${r.text.slice(0, 150)}`);
  r = await api('POST', '/api/ai/career-paths', { role: 'Software Engineer' });
  log('ai-career-paths', r.status < 500, `${r.status} ${r.text.slice(0, 150)}`);
  r = await api('POST', '/api/ai/interview-questions', { role: 'Software Engineer' });
  log('ai-interview-questions', r.status < 500, `${r.status} ${r.text.slice(0, 140)}`);

  // AI agent page renders
  await page.goto(`${BASE}/profile/ai`, { waitUntil: 'networkidle' });
  const onProfileAi = !page.url().includes('/login');
  log('page /profile/ai', onProfileAi, onProfileAi ? 'rendered (authed)' : 'redirected to login');

  // usage limits surface (entitlements/usage)
  r = await api('GET', '/api/entitlements');
  log('entitlements-detail', r.status === 200, `${r.text.slice(0, 160)}`);
  await browser.close();
})();
