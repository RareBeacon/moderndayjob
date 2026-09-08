import { describe, it, expect } from 'vitest';
import { greenhouseApplyAdapter } from '../lib/apply/adapters/greenhouse';
import { leverApplyAdapter } from '../lib/apply/adapters/lever';
import type { ApplyCandidate, ApplyPage } from '../lib/apply/types';

/** A minimal fake page: a set of "present" selectors + recorded actions. */
class FakePage implements ApplyPage {
  present = new Set<string>();
  fills: [string, string][] = [];
  clicks: string[] = [];
  uploads: { selector: string; files: string[] }[] = [];
  currentUrl = '';
  pageTitle = 'Apply';
  html = '';

  constructor(opts: { present?: string[]; html?: string; url?: string } = {}) {
    opts.present?.forEach((s) => this.present.add(s));
    this.html = opts.html ?? '<form><input type="file"/><button type="submit">Submit</button></form>';
    this.currentUrl = opts.url ?? 'https://boards.greenhouse.io/acme/jobs/1';
  }

  url() { return this.currentUrl; }
  async title() { return this.pageTitle; }
  async content() { return this.html; }
  async has(sel: string) {
    return sel.split(',').map((s) => s.trim()).some((s) => this.present.has(s));
  }
  async fill(sel: string, value: string) {
    if (!(await this.has(sel))) throw new Error(`missing ${sel}`);
    this.fills.push([sel, value]);
  }
  async check() {}
  async click(sel: string) {
    if (!(await this.has(sel))) throw new Error(`missing ${sel}`);
    this.clicks.push(sel);
  }
  async setInputFiles(sel: string, files: string[]) {
    if (!(await this.has(sel))) throw new Error(`missing ${sel}`);
    this.uploads.push({ selector: sel, files });
  }
  async selectOption() {}
  async goto(url: string) { this.currentUrl = url; }
}

const candidate = (over: Partial<ApplyCandidate> = {}): ApplyCandidate => ({
  jobUrl: 'https://boards.greenhouse.io/acme/jobs/1',
  company: 'Acme',
  title: 'Engineer',
  email: 'dev@example.com',
  name: 'Ada Lovelace',
  phone: null,
  cvPath: '/tmp/cv.pdf',
  cvDownloadUrl: null,
  coverLetter: 'Hello, I would love this role.',
  answers: [],
  ...over,
});

const GH_FIELDS = [
  'input[type="file"]',
  'button[type="submit"]',
  'input[name="job_application[first_name]"]',
  'input[name="job_application[last_name]"]',
  'input[name="job_application[email]"]',
  'textarea[name="job_application[cover_letter]"]',
];

describe('greenhouseApplyAdapter', () => {
  it('matches greenhouse hosts', () => {
    expect(greenhouseApplyAdapter.matches(new URL('https://boards.greenhouse.io/acme/jobs/1'))).toBe(true);
    expect(greenhouseApplyAdapter.matches(new URL('https://jobs.lever.co/acme/1'))).toBe(false);
  });

  it('fills the form, uploads the CV and submits', async () => {
    const page = new FakePage({ present: GH_FIELDS });
    const out = await greenhouseApplyAdapter.apply(page, candidate());
    expect(out.outcome).toBe('SUBMITTED');
    expect(page.fills.map((f) => f[1])).toContain('dev@example.com');
    expect(page.uploads).toEqual([{ selector: 'input[type="file"]', files: ['/tmp/cv.pdf'] }]);
    expect(page.clicks).toContain('button[type="submit"]');
  });

  it('stops on a CAPTCHA', async () => {
    const page = new FakePage({ present: GH_FIELDS, html: '<div class="g-recaptcha"></div>' });
    const out = await greenhouseApplyAdapter.apply(page, candidate());
    expect(out).toMatchObject({ outcome: 'STOP', code: 'CAPTCHA' });
    expect(page.clicks).toHaveLength(0); // nothing clicked
  });

  it('stops with MISSING_INFO when name/email are absent', async () => {
    const page = new FakePage({ present: GH_FIELDS });
    const out = await greenhouseApplyAdapter.apply(page, candidate({ name: null }));
    expect(out).toMatchObject({ outcome: 'STOP', code: 'MISSING_INFO' });
  });

  it('stops with UNSUPPORTED_FORM when the CV input is missing', async () => {
    const page = new FakePage({ present: ['button[type="submit"]'] });
    const out = await greenhouseApplyAdapter.apply(page, candidate());
    expect(out).toMatchObject({ outcome: 'STOP', code: 'UNSUPPORTED_FORM' });
  });
});

const LEVER_FIELDS = [
  'input[type="file"]',
  'button[type="submit"]',
  'input[name="name"]',
  'input[name="email"]',
  'textarea[name="comments"]',
];

describe('leverApplyAdapter', () => {
  it('matches lever hosts', () => {
    expect(leverApplyAdapter.matches(new URL('https://jobs.lever.co/acme/1'))).toBe(true);
  });

  it('fills and submits', async () => {
    const page = new FakePage({ present: LEVER_FIELDS, url: 'https://jobs.lever.co/acme/1' });
    const out = await leverApplyAdapter.apply(page, candidate({ jobUrl: 'https://jobs.lever.co/acme/1' }));
    expect(out.outcome).toBe('SUBMITTED');
    expect(page.fills.map((f) => f[1])).toContain('Ada Lovelace');
    expect(page.fills.map((f) => f[1])).toContain('dev@example.com');
  });
});
