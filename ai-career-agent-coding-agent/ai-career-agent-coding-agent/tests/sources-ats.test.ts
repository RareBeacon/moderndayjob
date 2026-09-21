import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workableAdapter, smartrecruitersAdapter, defaultAdapters } from '../lib/jobsources/boards';
import { workableApplyAdapter } from '../lib/apply/adapters/workable';
import { detectApplyAdapter } from '../lib/apply/registry';
import type { FetchLike } from '../lib/jobsources/types';
import type { ApplyCandidate, ApplyPage } from '../lib/apply/types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'workable-application.html'), 'utf8');

/** JSON response fake. */
const jsonResponse = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) }) as unknown as Response;

const WORKABLE_PAYLOAD = {
  name: 'Quick Hire Staffing',
  description: 'Jobs',
  jobs: [
    {
      title: 'Class A Metal Finishers $21-$26',
      url: 'https://apply.workable.com/j/E5723F36D6',
      shortcode: 'E5723F36D6',
      city: 'Birmingham',
      state: 'Alabama',
      country: 'United States',
      telecommuting: false,
      published_on: '2026-09-18T00:00:00Z',
    },
    { title: '', url: 'https://apply.workable.com/j/NOPE' }, // skipped: no title
  ],
};

const SR_PAYLOAD = {
  totalFound: 2,
  content: [
    {
      id: '744000150739999',
      name: 'Analista de Aduanas',
      company: { identifier: 'BoschGroup', name: 'Bosch Group' },
      releasedDate: '2026-09-21T15:55:01.023Z',
      location: { city: 'Nuevo Leon', country: 'mx', remote: false, hybrid: true, fullLocation: 'Nuevo Leon, MONTERREY, Mexico' },
    },
    { name: 'No id posting' }, // skipped: no id
  ],
};

describe('workableAdapter (source)', () => {
  it('normalizes the public widget payload', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(WORKABLE_PAYLOAD);
    const rows = await workableAdapter('quickhirestaffing', fetchImpl).fetchBatch(50);
    expect(rows).toHaveLength(1);
    const j = rows[0];
    expect(j.source).toBe('WORKABLE');
    expect(j.external_id).toBe('E5723F36D6');
    expect(j.title).toBe('Class A Metal Finishers $21-$26');
    expect(j.url).toBe('https://apply.workable.com/j/E5723F36D6');
    expect(j.location).toBe('Birmingham, Alabama, United States');
    expect(String(j.metadata.contentHash)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws on HTTP failure (circuit breaker counts it)', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({}, false);
    await expect(workableAdapter('dead', fetchImpl).fetchBatch(10)).rejects.toThrow('WORKABLE_HTTP_500');
  });
});

describe('smartrecruitersAdapter (source)', () => {
  it('normalizes the public postings payload', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(SR_PAYLOAD);
    const rows = await smartrecruitersAdapter('BoschGroup', fetchImpl).fetchBatch(50);
    expect(rows).toHaveLength(1);
    const j = rows[0];
    expect(j.source).toBe('SMARTRECRUITERS');
    expect(j.external_id).toBe('744000150739999');
    expect(j.company).toBe('Bosch Group');
    expect(j.url).toBe('https://jobs.smartrecruiters.com/BoschGroup/744000150739999');
    expect(j.location).toBe('Nuevo Leon, MONTERREY, Mexico');
  });

  it('throws on HTTP failure', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({}, false);
    await expect(smartrecruitersAdapter('dead', fetchImpl).fetchBatch(10)).rejects.toThrow('SMARTRECRUITERS_HTTP_500');
  });
});

describe('defaultAdapters includes the new sources', () => {
  it('adds the default Workable board', () => {
    const ids = defaultAdapters({} as NodeJS.ProcessEnv).map((a) => a.id);
    expect(ids).toContain('workable:quickhirestaffing');
    expect(ids).toContain('ashby:openai');
  });
});

/** Fake page over the real rendered Workable fixture. */
class FakePage implements ApplyPage {
  present: Set<string>;
  fills: [string, string][] = [];
  clicks: string[] = [];
  uploads: { selector: string; files: string[] }[] = [];
  currentUrl: string;
  pageTitle = 'Apply';
  html: string;

  constructor(opts: { html: string; url?: string }) {
    this.html = opts.html;
    this.currentUrl = opts.url ?? 'https://apply.workable.com/j/E5723F36D6';
    this.present = new Set([
      'input[type="file"]',
      'button[type="submit"]',
      '#firstname',
      '#lastname',
      '#email',
      'input[name="phone"]',
      '#cover_letter',
      'input[type="file"][data-ui="resume"]',
      'button[data-ui="apply-button"]',
    ]);
  }

  url() { return this.currentUrl; }
  async title() { return this.pageTitle; }
  async content() { return this.html; }
  async has(sel: string) { return this.present.has(sel); }
  async fill(sel: string, value: string) { this.fills.push([sel, value]); }
  async check() {}
  async click(sel: string) { this.clicks.push(sel); }
  async setInputFiles(sel: string, files: string[]) { this.uploads.push({ selector: sel, files }); }
  async selectOption() {}
  async goto(url: string) { this.currentUrl = url; }
}

/** A synthetic captcha-free Workable form with the live-verified selectors. */
const WORKABLE_FORM = `
<html><body>
  <form data-ui="application-form">
    <input type="text" id="firstname" name="firstname" required />
    <input type="text" id="lastname" name="lastname" required />
    <input type="email" id="email" name="email" required />
    <input type="tel" name="phone" />
    <textarea id="cover_letter" name="cover_letter"></textarea>
    <input type="file" data-ui="avatar" accept="image/*" />
    <input type="file" data-ui="resume" accept=".pdf,.doc" required />
    <button type="submit" data-ui="apply-button">Submit application</button>
  </form>
</body></html>`;

describe('the real Workable fixture carries the verified structure', () => {
  it('contains the stable selectors the adapter depends on', () => {
    expect(FIXTURE).toContain('data-ui="resume"');
    expect(FIXTURE).toContain('data-ui="avatar"');
    expect(FIXTURE).toContain('data-ui="apply-button"');
    expect(FIXTURE).toContain('data-ui="application-form"');
    expect(FIXTURE).toContain('id="firstname"');
    expect(FIXTURE).toContain('id="lastname"');
    expect(FIXTURE).toContain('id="email"');
    expect(FIXTURE).toContain('name="phone"');
    expect(FIXTURE).toContain('id="cover_letter"');
  });
});

const candidate = (over: Partial<ApplyCandidate> = {}): ApplyCandidate => ({
  jobUrl: 'https://apply.workable.com/j/E5723F36D6',
  company: 'Quick Hire Staffing',
  title: 'Class A Metal Finishers',
  email: 'dev@example.com',
  name: 'Ada Lovelace',
  phone: '+2349000000000',
  cvPath: '/tmp/cv.pdf',
  cvDownloadUrl: null,
  coverLetter: 'Honest cover letter.',
  answers: [],
  ...over,
});

describe('workableApplyAdapter', () => {
  it('matches apply.workable.com hosts only', () => {
    expect(workableApplyAdapter.matches(new URL('https://apply.workable.com/j/E5723F36D6'))).toBe(true);
    expect(workableApplyAdapter.matches(new URL('https://apply.workable.com/j/E5723F36D6/apply'))).toBe(true);
    expect(workableApplyAdapter.matches(new URL('https://quickhirestaffing.workable.com/j/X'))).toBe(false);
    expect(workableApplyAdapter.matches(new URL('https://jobs.ashbyhq.com/linear/abc'))).toBe(false);
  });

  it('is discoverable through the apply registry', () => {
    expect(detectApplyAdapter('https://apply.workable.com/j/E5723F36D6')?.id).toBe('workable');
  });

  it('navigates to /apply and fills the verified fields', async () => {
    // The real probed board's form carries reCAPTCHA in the fixture HTML, so
    // the happy path uses a synthetic captcha-free form with the same
    // verified selectors; the real fixture proves structure and the stop.
    const page = new FakePage({ html: WORKABLE_FORM });
    const out = await workableApplyAdapter.apply(page, candidate());
    expect(out.outcome).toBe('SUBMITTED');
    expect(page.currentUrl).toBe('https://apply.workable.com/j/E5723F36D6/apply');
    expect(page.fills).toContainEqual(['#firstname', 'Ada']);
    expect(page.fills).toContainEqual(['#lastname', 'Lovelace']);
    expect(page.fills).toContainEqual(['#email', 'dev@example.com']);
    expect(page.fills).toContainEqual(['#cover_letter', 'Honest cover letter.']);
    expect(page.uploads).toEqual([{ selector: 'input[type="file"][data-ui="resume"]', files: ['/tmp/cv.pdf'] }]);
    expect(page.clicks).toEqual(['button[data-ui="apply-button"]']);
  });

  it('stays put when already on the /apply form', async () => {
    const page = new FakePage({ html: WORKABLE_FORM, url: 'https://apply.workable.com/j/E5723F36D6/apply' });
    const out = await workableApplyAdapter.apply(page, candidate());
    expect(out.outcome).toBe('SUBMITTED');
    expect(page.currentUrl).toBe('https://apply.workable.com/j/E5723F36D6/apply');
  });

  it('stops honestly on the real probed board (reCAPTCHA present)', async () => {
    const page = new FakePage({ html: FIXTURE });
    const out = await workableApplyAdapter.apply(page, candidate());
    expect(out).toMatchObject({ outcome: 'STOP', code: 'CAPTCHA' });
    expect(page.clicks).toEqual([]);
  });

  it('stops with UNSUPPORTED_FORM when the structure is missing', async () => {
    const page = new FakePage({ html: '<html></html>' });
    const page2 = Object.create(page) as FakePage;
    page2.present = new Set(['input[type="file"]', 'button[type="submit"]']);
    const out = await workableApplyAdapter.apply(page2, candidate());
    expect(out).toMatchObject({ outcome: 'STOP', code: 'UNSUPPORTED_FORM' });
  });

  it('stops with MISSING_INFO when there is no CV file', async () => {
    const page = new FakePage({ html: WORKABLE_FORM });
    const out = await workableApplyAdapter.apply(page, candidate({ cvPath: null }));
    expect(out).toMatchObject({ outcome: 'STOP', code: 'MISSING_INFO' });
    expect(page.clicks).toEqual([]);
  });
});
