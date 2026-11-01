import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const HANDSHAKE_URL =
  'https://drive.google.com/uc?id=1QizQex4vkEJ8LcN7qr05E_6SWSJmPEoN&export=download';

const TEMPLATES_30 = [
  { code: '01', id: 'tpl-01-executive', folder: '01-Executive', file: 'Executive-Resume.pdf' },
  { code: '02', id: 'tpl-02-corporate-standard', folder: '02-Corporate-Standard', file: 'Corporate-Standard-Resume.pdf' },
  { code: '03', id: 'tpl-03-modern-professional', folder: '03-Modern-Professional', file: 'Modern-Professional-Resume.pdf' },
  { code: '04', id: 'tpl-04-elegant-minimalist', folder: '04-Elegant-Minimalist', file: 'Elegant-Minimalist-Resume.pdf' },
  { code: '05', id: 'tpl-05-senior-leader', folder: '05-Senior-Leader', file: 'Senior-Leader-Resume.pdf' },
  { code: '06', id: 'tpl-06-software-engineer', folder: '06-Software-Engineer', file: 'Software-Engineer-Resume.pdf' },
  { code: '07', id: 'tpl-07-ai-ml-specialist', folder: '07-AI-ML-Specialist', file: 'AI-ML-Specialist-Resume.pdf' },
  { code: '08', id: 'tpl-08-data-scientist', folder: '08-Data-Scientist', file: 'Data-Scientist-Resume.pdf' },
  { code: '09', id: 'tpl-09-product-manager', folder: '09-Product-Manager', file: 'Product-Manager-Resume.pdf' },
  { code: '10', id: 'tpl-10-cybersecurity-specialist', folder: '10-Cybersecurity-Specialist', file: 'Cybersecurity-Specialist-Resume.pdf' },
  { code: '11', id: 'tpl-11-management-consultant', folder: '11-Management-Consultant', file: 'Management-Consultant-Resume.pdf' },
  { code: '12', id: 'tpl-12-financial-analyst', folder: '12-Financial-Analyst', file: 'Financial-Analyst-Resume.pdf' },
  { code: '13', id: 'tpl-13-business-development', folder: '13-Business-Development', file: 'Business-Development-Resume.pdf' },
  { code: '14', id: 'tpl-14-marketing-strategist', folder: '14-Marketing-Strategist', file: 'Marketing-Strategist-Resume.pdf' },
  { code: '15', id: 'tpl-15-operations-manager', folder: '15-Operations-Manager', file: 'Operations-Manager-Resume.pdf' },
  { code: '16', id: 'tpl-16-creative-professional', folder: '16-Creative-Professional', file: 'Creative-Professional-Resume.pdf' },
  { code: '17', id: 'tpl-17-graphic-designer', folder: '17-Graphic-Designer', file: 'Graphic-Designer-Resume.pdf' },
  { code: '18', id: 'tpl-18-ux-ui-designer', folder: '18-UX-UI-Designer', file: 'UX-UI-Designer-Resume.pdf' },
  { code: '19', id: 'tpl-19-content-communications', folder: '19-Content-Communications', file: 'Content-Communications-Resume.pdf' },
  { code: '20', id: 'tpl-20-digital-creator', folder: '20-Digital-Creator', file: 'Digital-Creator-Resume.pdf' },
  { code: '21', id: 'tpl-21-academic-researcher', folder: '21-Academic-Researcher', file: 'Academic-Researcher-Resume.pdf' },
  { code: '22', id: 'tpl-22-graduate-academic', folder: '22-Graduate-Academic', file: 'Graduate-Academic-Resume.pdf' },
  { code: '23', id: 'tpl-23-teacher-educator', folder: '23-Teacher-Educator', file: 'Teacher-Educator-Resume.pdf' },
  { code: '24', id: 'tpl-24-scientific-professional', folder: '24-Scientific-Professional', file: 'Scientific-Professional-Resume.pdf' },
  { code: '25', id: 'tpl-25-graduate-starter', folder: '25-Graduate-Starter', file: 'Graduate-Starter-Resume.pdf' },
  { code: '26', id: 'tpl-26-career-changer', folder: '26-Career-Changer', file: 'Career-Changer-Resume.pdf' },
  { code: '27', id: 'tpl-27-experienced-specialist', folder: '27-Experienced-Specialist', file: 'Experienced-Specialist-Resume.pdf' },
  { code: '28', id: 'tpl-28-project-based-professional', folder: '28-Project-Based-Professional', file: 'Project-Based-Professional-Resume.pdf' },
  { code: '29', id: 'tpl-29-international-professional', folder: '29-International-Professional', file: 'International-Professional-Resume.pdf' },
  { code: '30', id: 'tpl-30-modern-two-column', folder: '30-Modern-Two-Column', file: 'Modern-Two-Column-Resume.pdf' },
];

async function readHandshake(): Promise<string> {
  try {
    const res = await fetch(`${HANDSHAKE_URL}&cb=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      redirect: 'follow',
    });
    if (!res.ok) return 'DISARMED';
    return (await res.text()).trim();
  } catch {
    return 'DISARMED';
  }
}

test('on-demand live QA validation: Alex Morgan profile & 30 A4 PDF exports', async ({ browser }, testInfo) => {
  if (testInfo.project.name !== 'desktop') {
    test.skip();
    return;
  }

  const initialState = await readHandshake();
  if (!initialState.startsWith('ARMED')) {
    test.skip();
    return;
  }

  test.setTimeout(300_000);

  const outDir = '/tmp/jobiest-live-qa-out';
  const shotsDir = path.join(outDir, 'screenshots');
  const pdfDir = path.join(outDir, 'pdfs');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(pdfDir, { recursive: true });

  // 1. Multi-breakpoint live /templates gallery & modal screenshots
  const ctxDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const galleryPage = await ctxDesktop.newPage();
  await galleryPage.goto('/templates', { waitUntil: 'networkidle' });
  await galleryPage.screenshot({
    path: path.join(shotsDir, '01-library-desktop-1440.jpg'),
    type: 'jpeg',
    quality: 84,
    fullPage: true,
  });

  await galleryPage.getByRole('button', { name: /^Technical/ }).click();
  await galleryPage.waitForTimeout(250);
  await galleryPage.screenshot({ path: path.join(shotsDir, '05-library-filter-technical.jpg'), type: 'jpeg', quality: 84 });

  await galleryPage.getByRole('button', { name: /^Executive/ }).click();
  await galleryPage.waitForTimeout(250);
  await galleryPage.screenshot({ path: path.join(shotsDir, '06-library-filter-executive.jpg'), type: 'jpeg', quality: 84 });

  await galleryPage.getByRole('button', { name: /^All Templates/ }).click();
  await galleryPage.getByLabel('Search resume templates').fill('Software Engineer');
  await galleryPage.waitForTimeout(250);
  await galleryPage.screenshot({ path: path.join(shotsDir, '07-library-search-engineer.jpg'), type: 'jpeg', quality: 84 });
  await galleryPage.getByLabel('Search resume templates').fill('');
  await galleryPage.waitForTimeout(250);

  const viewAllBtn = galleryPage.getByRole('button', { name: /View all 30 templates/i });
  if (await viewAllBtn.isVisible()) {
    await viewAllBtn.click();
    await galleryPage.waitForTimeout(350);
  }
  await galleryPage.screenshot({
    path: path.join(shotsDir, '11-library-all-30-cards.jpg'),
    type: 'jpeg',
    quality: 80,
    fullPage: true,
  });

  for (const [btnLabel, fileName] of [
    ['Preview The Executive full size', '08-modal-preview-01-executive.jpg'],
    ['Preview The Software Engineer full size', '09-modal-preview-06-software-engineer.jpg'],
    ['Preview The Digital Creator full size', '10-modal-preview-20-digital-creator.jpg'],
  ] as const) {
    await galleryPage.getByRole('button', { name: btnLabel }).click();
    await expect(galleryPage.getByRole('dialog')).toBeVisible();
    await galleryPage.waitForTimeout(250);
    await galleryPage.screenshot({ path: path.join(shotsDir, fileName), type: 'jpeg', quality: 85 });
    await galleryPage.getByRole('button', { name: 'Close template preview' }).click();
  }
  await ctxDesktop.close();

  for (const [vp, fileName] of [
    [{ width: 1280, height: 800 }, '02-library-laptop-1280.jpg'],
    [{ width: 768, height: 1024 }, '03-library-tablet-768.jpg'],
    [{ width: 390, height: 844 }, '04-library-mobile-390.jpg'],
  ] as const) {
    const vpCtx = await browser.newContext({ viewport: vp });
    const vpPage = await vpCtx.newPage();
    await vpPage.goto('/templates', { waitUntil: 'networkidle' });
    await vpPage.screenshot({ path: path.join(shotsDir, fileName), type: 'jpeg', quality: 84 });
    await vpCtx.close();
  }

  // 2. Real QA account creation on live /signup (ephemeral in-RAM password, never logged or persisted)
  const suffix = String(Date.now()).slice(-6);
  const qaEmail = `ogungboyeopeyemiphilip+alexmorgan${suffix}@gmail.com`;
  const ephemeralPassword = `${crypto.randomBytes(18).toString('base64url')}9!Aa`;

  const authCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authCtx.newPage();
  await page.goto('/signup', { waitUntil: 'networkidle' });
  await page.getByLabel('Full name').fill('Alex Morgan');
  await page.getByLabel('Email', { exact: true }).fill(qaEmail);
  await page.getByLabel('Country code').selectOption('+44');
  await page.getByPlaceholder('801 234 5678').fill('7700900123');
  await page.locator('input[autocomplete="new-password"]').fill(ephemeralPassword);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(/\/verify-email/, { timeout: 30_000 });
  await page.screenshot({ path: path.join(shotsDir, '12-signup-verify-email-gate.jpg'), type: 'jpeg', quality: 84 });

  console.log(`[QA-LIVE] Registered QA account ${qaEmail}; awaiting 6-digit OTP verification...`);

  // 3. Poll handshake for 6-digit OTP code delivered to Gmail inbox
  let otpCode = '';
  const deadline = Date.now() + 210_000;
  while (Date.now() < deadline) {
    const state = await readHandshake();
    const match = /^OTP:(\d{6})$/.exec(state);
    if (match) {
      otpCode = match[1];
      break;
    }
    await page.waitForTimeout(4500);
  }
  expect(otpCode, 'Expected 6-digit OTP code from Gmail inbox').toMatch(/^\d{6}$/);

  await page.locator('input[autocomplete="one-time-code"]').fill(otpCode);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.waitForURL(/\/login/, { timeout: 25_000 });

  // 4. Sign in via live /login form
  await page.getByLabel('Email', { exact: true }).fill(qaEmail);
  await page.locator('input[autocomplete="current-password"]').fill(ephemeralPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(dashboard|generate|onboarding)/, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shotsDir, '13-authenticated-dashboard.jpg'), type: 'jpeg', quality: 84 });

  // 5. Populate complete Alex Morgan profile & Resume Studio draft
  const alexDraft = {
    versionName: 'Alex Morgan - Master Resume',
    selectedTemplate: 'tpl-03-modern-professional',
    currentStep: 'review',
    personal: {
      name: 'Alex Morgan',
      email: qaEmail,
      phone: '+44 7700 900123',
      location: 'London, United Kingdom',
      website: 'alexmorgan.dev',
      linkedin: 'linkedin.com/in/alex-morgan-profile',
      github: 'github.com/alexmorgan-dev',
      photoDataUrl: '',
    },
    career: {
      headline: 'Senior Software Engineer & AI Automation Specialist',
      targetRole: 'Senior Software Engineer',
      yearsExperience: '7+',
      seniority: 'senior',
      summary:
        'Senior Software Engineer with 7+ years of experience designing scalable web platforms, automation workflows, and data-driven digital products across fintech, SaaS, and enterprise technology environments. Proven record of improving system reliability, reducing operational overhead, and leading cross-functional engineering delivery from architecture through launch.',
    },
    skills: [
      { name: 'TypeScript', category: 'Languages', priority: 1 },
      { name: 'Python', category: 'Languages', priority: 2 },
      { name: 'SQL', category: 'Languages', priority: 3 },
      { name: 'React', category: 'Frameworks & APIs', priority: 4 },
      { name: 'Next.js', category: 'Frameworks & APIs', priority: 5 },
      { name: 'Node.js', category: 'Frameworks & APIs', priority: 6 },
      { name: 'REST APIs', category: 'Frameworks & APIs', priority: 7 },
      { name: 'GraphQL', category: 'Frameworks & APIs', priority: 8 },
      { name: 'PostgreSQL', category: 'Cloud, Data & DevOps', priority: 9 },
      { name: 'Docker', category: 'Cloud, Data & DevOps', priority: 10 },
      { name: 'AWS', category: 'Cloud, Data & DevOps', priority: 11 },
      { name: 'CI/CD', category: 'Cloud, Data & DevOps', priority: 12 },
      { name: 'AI Workflow Automation', category: 'AI, Data & Automation', priority: 13 },
      { name: 'Product Analytics', category: 'AI, Data & Automation', priority: 14 },
    ],
    experiences: [
      {
        id: 'exp-novatech',
        company: 'NovaTech Solutions',
        role: 'Senior Software Engineer',
        location: 'London, UK',
        startDate: 'Jan 2023',
        endDate: 'Present',
        current: true,
        roughNotes: 'Led customer workflow platform, database latency optimization, AI triage tools, and mentoring.',
        tools: ['TypeScript', 'Next.js', 'Python', 'PostgreSQL', 'AWS'],
        impact: '99.95% uptime across 1.2M monthly requests, 38% faster API latency, 52% reduction in manual triage.',
        bullets: [
          'Architected multi-tenant customer workflow services handling over 1.2M monthly requests with 99.95% uptime.',
          'Reduced API response latency by 38% by redesigning database indexing, caching strategies, and background job queues.',
          'Built internal AI-assisted support and document triage tools that cut manual operations review time by 52%.',
          'Mentored 5 mid-level and junior engineers, introducing code review standards and automated release checks.',
        ],
      },
      {
        id: 'exp-bright',
        company: 'Bright Systems Ltd',
        role: 'Full-Stack Software Engineer',
        location: 'Manchester, UK',
        startDate: 'Mar 2020',
        endDate: 'Dec 2022',
        current: false,
        roughNotes: 'Full-stack B2B analytics platform, automated billing/onboarding, dashboards, and test coverage.',
        tools: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
        impact: '45,000+ active users, onboarding reduced from 5 days to under 6 hours, 44% fewer post-release defects.',
        bullets: [
          'Developed React, TypeScript, and Node.js applications for B2B analytics clients across 45,000+ active users.',
          'Built automated billing, reporting, and onboarding workflows that decreased customer setup time from 5 days to under 6 hours.',
          'Partnered with product and UX teams to launch self-serve analytics dashboards, increasing feature adoption by 29%.',
          'Improved test coverage from 41% to 84%, reducing post-release defects by 44%.',
        ],
      },
      {
        id: 'exp-digitalbridge',
        company: 'Digital Bridge',
        role: 'Junior Software Developer',
        location: 'Birmingham, UK',
        startDate: 'Jul 2018',
        endDate: 'Feb 2020',
        current: false,
        roughNotes: 'Responsive client portals, REST API integrations, recurring QA automation.',
        tools: ['JavaScript', 'SQL', 'REST APIs'],
        impact: '18 SME client accounts supported, 12 engineering hours saved weekly.',
        bullets: [
          'Implemented responsive web interfaces and REST API integrations for client portals across 18 SME accounts.',
          'Automated recurring data imports and QA checks, saving approximately 12 engineering hours per week.',
          'Collaborated in agile sprints, contributing bug fixes, technical documentation, and production support.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-manchester',
        institution: 'University of Manchester',
        degree: 'BSc (Hons)',
        field: 'Computer Science',
        startDate: 'Sep 2014',
        endDate: 'Jun 2018',
        achievements: 'First-Class Honours; Final-Year Project in Distributed Event Processing.',
      },
    ],
    projects: [
      {
        id: 'proj-workflow',
        name: 'AI Workflow Automation Platform',
        description:
          'Designed a modular event-driven automation toolkit connecting webhooks, LLM classification pipelines, and audit logs for operations teams.',
        technologies: ['Python', 'TypeScript', 'PostgreSQL', 'Docker'],
        url: 'github.com/alexmorgan-dev/workflow-platform',
        achievements: ['Processed 250k+ automated workflow events with full audit traceability.'],
      },
      {
        id: 'proj-matching',
        name: 'Intelligent Career Matching Engine',
        description:
          'Built a structured skill-extraction and role-scoring service evaluating candidate fit with explainable criteria.',
        technologies: ['Next.js', 'Node.js', 'SQL', 'GraphQL'],
        url: 'alexmorgan.dev/projects/career-matching',
        achievements: ['Cut candidate-role screening latency to under 180ms per evaluation.'],
      },
    ],
    certifications: [
      {
        id: 'cert-aws',
        name: 'AWS Certified Solutions Architect - Associate',
        issuer: 'Amazon Web Services',
        date: '2024',
      },
      {
        id: 'cert-gcp',
        name: 'Google Professional Data Engineer',
        issuer: 'Google Cloud',
        date: '2023',
      },
    ],
    languages: [
      { language: 'English', proficiency: 'Native' },
      { language: 'French', proficiency: 'Conversational' },
    ],
    publications: [],
    volunteer: [],
    memberships: ['British Computer Society (MBCS)'],
    achievements: [
      'Architected customer workflow services handling 1.2M+ monthly requests at 99.95% uptime.',
      'Cut manual operations review time by 52% via internal AI triage automation.',
    ],
    references: 'Available upon request.',
    additional: 'Languages: English (Native), French (Conversational). Right to work in the United Kingdom.',
    targetJobDescription: '',
  };

  const saved = await page.evaluate(async (draftPayload) => {
    const profRes = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Alex Morgan',
        target_roles: ['Senior Software Engineer', 'AI Automation Engineer'],
        headline: 'Senior Software Engineer & AI Automation Specialist',
        summary: draftPayload.career.summary,
        skills: draftPayload.skills.map((s) => s.name),
        experience: draftPayload.experiences.map((e) => ({
          company: e.company,
          title: e.role,
          description: e.bullets.join(' '),
        })),
        education: [
          {
            institution: 'University of Manchester',
            qualification: 'BSc (Hons) Computer Science',
          },
        ],
        links: { portfolio: 'https://alexmorgan.dev' },
      }),
    });
    const draftRes = await fetch('/api/resume-studio/draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: draftPayload }),
    });
    return { profileStatus: profRes.status, draftStatus: draftRes.status };
  }, alexDraft);

  expect(saved.profileStatus).toBe(200);
  expect(saved.draftStatus).toBe(200);

  await page.goto('/generate?template=tpl-03-modern-professional', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shotsDir, '14-resume-studio-templates-step.jpg'), type: 'jpeg', quality: 84 });

  // 6. Generate persisted CV document once via /api/resume-studio/generate
  const generated = await page.evaluate(async (draftPayload) => {
    const res = await fetch('/api/resume-studio/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: draftPayload }),
    });
    const body = (await res.json().catch(() => ({}))) as { documentId?: string; error?: string };
    return { status: res.status, body };
  }, alexDraft);

  expect(generated.status, JSON.stringify(generated.body)).toBe(200);
  expect(generated.body.documentId).toBeTruthy();
  const documentId = generated.body.documentId!;

  await page.goto('/documents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shotsDir, '15-documents-hub-saved-resume.jpg'), type: 'jpeg', quality: 84 });

  // 7. Export all 30 live A4 PDFs + verify DOCX export
  const manifest: Array<Record<string, unknown>> = [];
  for (const tpl of TEMPLATES_30) {
    const resp = await authCtx.request.get(
      `/api/documents/${encodeURIComponent(documentId)}/export?format=pdf&template=${encodeURIComponent(tpl.id)}`,
    );
    expect(resp.status(), `PDF export for ${tpl.id}`).toBe(200);
    const bytes = await resp.body();
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
    const dir = path.join(pdfDir, tpl.folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, tpl.file), bytes);
    manifest.push({
      code: tpl.code,
      id: tpl.id,
      folder: tpl.folder,
      file: tpl.file,
      byteSize: bytes.length,
    });
  }

  const docxResp = await authCtx.request.get(
    `/api/documents/${encodeURIComponent(documentId)}/export?format=docx&template=tpl-01-executive`,
  );
  expect(docxResp.status()).toBe(200);

  // Sign out cleanly
  await page.evaluate(async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
  });
  await authCtx.close();

  fs.writeFileSync(
    path.join(outDir, 'live-export-manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        qaAccountEmail: qaEmail,
        documentId,
        docxVerified: true,
        count: manifest.length,
        manifest,
      },
      null,
      2,
    ),
  );

  // Pack tar.gz and emit chunked base64 markers for retrieval via GitHub Actions run logs
  const tarPath = '/tmp/jobiest-live-qa-bundle.tar.gz';
  execFileSync('tar', ['-czf', tarPath, '-C', outDir, '.']);
  const b64 = fs.readFileSync(tarPath).toString('base64');
  console.log('===QA_TAR_GZ_B64_START===');
  for (let i = 0; i < b64.length; i += 4000) {
    console.log(b64.slice(i, i + 4000));
  }
  console.log('===QA_TAR_GZ_B64_END===');
});
