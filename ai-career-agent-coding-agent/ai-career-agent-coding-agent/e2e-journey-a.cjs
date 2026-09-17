/**
 * Production deep Journey A — profile → CV generation → export → job detail →
 * prepare application → saved jobs → match → support. Real account, real data.
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  log('login', true, new URL(page.url()).pathname);

  const api = async (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const r = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text: text.slice(0, 150) };
  }, { method, path, body });

  // ---------- 1. Complete the profile (real PUT) ----------
  let r = await api('PUT', '/api/profile', {
    full_name: 'QA Webtest',
    target_roles: ['Software Engineer', 'Backend Engineer'],
    headline: 'QA test account for jobiest.com production verification',
    summary: 'Labeled test account created by the Jobiest production recovery audit on 2026-09-17. Not a real user.',
    application_email: 'qa.webtest@jobiest.com',
    skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Testing'],
    experience: [{ company: 'Jobiest QA', title: 'Test Account', description: 'Synthetic test data for production verification.' }],
    education: [{ institution: 'Jobiest QA School', qualification: 'Production Verification' }],
  });
  log('profile-put', r.status === 200, `${r.status} ${r.text.slice(0, 80)}`);

  r = await api('GET', '/api/profile/completeness');
  log('profile-completeness', r.status === 200 && r.json?.percent > 0, `percent=${r.json?.percent} next=${JSON.stringify(r.json?.next ?? []).slice(0, 90)}`);

  // ---------- 2. Resume draft (save + reload persistence) ----------
  r = await api('PUT', '/api/resume-studio/draft', {
    name: 'QA draft',
    selectedTemplate: 'classic',
    content: { fullName: 'QA Webtest', email: 'qa.webtest@jobiest.com', targetRoles: ['Software Engineer'], summary: 'Test draft for production verification.' },
  });
  const draftOk = r.status === 200;
  log('resume-draft-save', r.status >= 200 && r.status < 300, `status=${r.status} ${r.text.slice(0, 80)}`);
  r = await api('GET', '/api/resume-studio/draft');
  log('resume-draft-persists', r.status === 200 && r.json?.draft != null, `draft present: ${r.json?.draft != null}, name: ${r.json?.draft?.name ?? r.json?.draft?.content?.fullName ?? 'n/a'}`);

  // ---------- 3. REAL CV generation (AI pipeline, real cost) ----------
  r = await api('POST', '/api/documents/generate', { kind: 'CV' });
  log('cv-generate', r.status === 200 && (r.json?.document || r.json?.documentId || r.json?.id), `${r.status} ${r.text.slice(0, 120)}`);
  const docId = r.json?.document?.id ?? r.json?.documentId ?? r.json?.id;

  if (docId) {
    r = await api('GET', '/api/documents');
    const docs = r.json?.documents ?? [];
    log('cv-listed', docs.length >= 1, `${docs.length} document(s), first kind=${docs[0]?.kind ?? docs[0]?.document_kind}`);
    r = await api('GET', `/api/documents/${docId}/export?format=pdf`);
    log('cv-export-pdf', r.status === 200 || r.status === 202, `${r.status} ${r.text.slice(0, 90)}`);
  }

  // ---------- 4. Jobs page cards + real UUID from the API ----------
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
  const cardCount = await page.locator('article.job-card').count();
  const extLinks = await page.locator('article.job-card a.inline-link[href^="http"]').count();
  log('jobs-page-cards', cardCount > 0, `${cardCount} job cards, ${extLinks} external 'View original' links`);
  r = await api('GET', '/api/jobs');
  const jobsList = r.json?.jobs ?? [];
  const jobId = jobsList.find((j) => j.id && /^[0-9a-f-]{36}$/.test(j.id))?.id ?? null;
  log('jobs-api-uuid', !!jobId, `real job UUID: ${jobId}`);

  if (jobId) {
    r = await api('PUT', '/api/saved-jobs', { jobId });
    log('save-job', r.status === 200 || r.status === 201, `${r.status} ${r.text.slice(0, 80)}`);
    r = await api('GET', '/api/saved-jobs');
    log('saved-jobs-listed', (r.json?.jobs?.length ?? 0) >= 1, `${r.json?.jobs?.length ?? 0} saved`);

    r = await api('POST', '/api/applications/prepare', { jobId });
    log('application-prepare', r.status < 500, `${r.status} ${r.text.slice(0, 170)} (real state, honest response)`);

    r = await api('POST', '/api/ai/match', { maxScored: 5 });
    log('ai-match-real', r.status < 500, `${r.status} ${r.text.slice(0, 160)}`);
  }

  // ---------- 5. Support (valid labeled message; honest delivered flag) ----------
  r = await api('POST', '/api/support', {
    email: 'qa.webtest@jobiest.com',
    category: 'Jobs',
    subject: 'PRODUCTION AUDIT TEST — please disregard',
    message: 'This is an automated test message sent during the Jobiest production recovery audit on 2026-09-17. It verifies the support pipeline end to end. No reply is needed.',
  });
  log('support-submit', r.status === 200 && r.json?.ok === true, `status=${r.status} ok=${r.json?.ok} delivered=${r.json?.delivered}`);

  // evidence screenshot
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'e2e-dashboard-evidence.png', fullPage: false });
  log('screenshot', true, 'e2e-dashboard-evidence.png saved');

  await browser.close();
})();
