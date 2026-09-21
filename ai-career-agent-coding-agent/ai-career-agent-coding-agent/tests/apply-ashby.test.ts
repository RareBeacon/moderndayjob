import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ashbyApplyAdapter, parseAshbyFields } from '../lib/apply/adapters/ashby';
import { detectApplyAdapter } from '../lib/apply/registry';
import type { ApplyCandidate, ApplyPage } from '../lib/apply/types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'ashby-application.html'), 'utf8');

/** A minimal fake page over a rendered-HTML fixture (same shape as the real
 * worker binding: has() is immediate, fill/click act on known selectors). */
class FakePage implements ApplyPage {
  present: Set<string>;
  fills: [string, string][] = [];
  clicks: string[] = [];
  uploads: { selector: string; files: string[] }[] = [];
  currentUrl: string;
  pageTitle = 'Senior / Staff Fullstack Engineer @ Linear';
  html: string;

  constructor(opts: { html: string; url?: string; present?: string[] }) {
    this.html = opts.html;
    this.currentUrl = opts.url ?? 'https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff';
    this.present = new Set(opts.present ?? derivePresent(opts.html));
    // The engine navigates to the job URL; the adapter must reach /application.
  }

  url() { return this.currentUrl; }
  async title() { return this.pageTitle; }
  async content() { return this.html; }
  async has(sel: string) {
    return sel.split(',').map((s) => s.trim()).some((s) => this.present.has(s));
  }
  async fill(sel: string, value: string) { this.fills.push([sel, value]); }
  async check() {}
  async click(sel: string) { this.clicks.push(sel); }
  async setInputFiles(sel: string, files: string[]) { this.uploads.push({ selector: sel, files }); }
  async selectOption() {}
  async goto(url: string) { this.currentUrl = url; }
}

/** Derive the selectors the adapter will probe from a rendered Ashby page. */
function derivePresent(html: string): string[] {
  const present: string[] = [];
  // Generic signals the shared stop-scan reads on every page.
  if (/<input[^>]*type="file"/.test(html)) present.push('input[type="file"]');
  if (/<button[^>]*type="submit"/.test(html)) present.push('button[type="submit"]');
  // Ashby-specific structure the adapter requires.
  if (/<input[^>]*name="_systemfield_name"/.test(html)) present.push('input[name="_systemfield_name"]');
  if (/<input[^>]*name="_systemfield_email"/.test(html)) present.push('input[name="_systemfield_email"]');
  if (/<input[^>]*id="_systemfield_resume"/.test(html)) present.push('input#_systemfield_resume');
  if (/ashby-application-form-submit-button/.test(html)) present.push('button.ashby-application-form-submit-button');
  for (const f of parseAshbyFields(html)) present.push(`[id="${f.id}"]`);
  return present;
}

const candidate = (over: Partial<ApplyCandidate> = {}): ApplyCandidate => ({
  jobUrl: 'https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff',
  company: 'Linear',
  title: 'Senior / Staff Fullstack Engineer',
  email: 'dev@example.com',
  name: 'Ada Lovelace',
  phone: null,
  cvPath: '/tmp/cv.pdf',
  cvDownloadUrl: null,
  coverLetter: 'I would love to build at Linear.',
  answers: [],
  ...over,
});

/** A synthetic minimal Ashby form with the verified structure. */
const SIMPLE_FORM = `
<html><body><div id="form">
  <label for="_systemfield_name">Name</label>
  <input type="text" name="_systemfield_name" id="_systemfield_name" required />
  <label for="_systemfield_email">Email</label>
  <input type="email" name="_systemfield_email" id="_systemfield_email" required />
  <label for="_systemfield_resume">Resume</label>
  <input type="file" id="_systemfield_resume" required />
  <label for="1c843a13-4fe3-43df-afcf-37a69d88591b">Github</label>
  <input type="text" name="1c843a13-4fe3-43df-afcf-37a69d88591b" id="1c843a13-4fe3-43df-afcf-37a69d88591b" />
  <label for="1ed7df4b-e6d4-484e-92c3-4a5f5e07fd0c">Cover letter</label>
  <textarea name="1ed7df4b-e6d4-484e-92c3-4a5f5e07fd0c" id="1ed7df4b-e6d4-484e-92c3-4a5f5e07fd0c" required></textarea>
  <button type="submit" class="ashby-application-form-submit-button"><span>Submit Application</span></button>
</div></body></html>`;

describe('ashbyApplyAdapter: matching', () => {
  it('matches only jobs.ashbyhq.com hosts', () => {
    expect(ashbyApplyAdapter.matches(new URL('https://jobs.ashbyhq.com/linear/abc'))).toBe(true);
    expect(ashbyApplyAdapter.matches(new URL('https://jobs.ashbyhq.com/linear/abc/application'))).toBe(true);
    expect(ashbyApplyAdapter.matches(new URL('https://app.ashbyhq.com/x'))).toBe(false);
    expect(ashbyApplyAdapter.matches(new URL('https://boards.greenhouse.io/acme/1'))).toBe(false);
  });

  it('is discoverable through the apply registry', () => {
    expect(detectApplyAdapter('https://jobs.ashbyhq.com/linear/abc')?.id).toBe('ashby');
    expect(detectApplyAdapter('https://jobs.ashbyhq.com/linear/abc/application')?.id).toBe('ashby');
  });
});

describe('parseAshbyFields (against the live-rendered fixture)', () => {
  it('finds the cover letter and the required company questions, skipping system fields', () => {
    const fields = parseAshbyFields(FIXTURE);
    expect(fields.some((f) => /cover\s*letter/i.test(f.label))).toBe(true);
    const country = fields.find((f) => /what country/i.test(f.label));
    expect(country?.required).toBe(true);
    // System fields and the recaptcha textarea are never returned as questions.
    expect(fields.every((f) => !f.id.startsWith('_systemfield'))).toBe(true);
    expect(fields.some((f) => f.id === 'g-recaptcha-response')).toBe(false);
  });
});

describe('ashbyApplyAdapter: applying', () => {
  it('navigates from the posting page to the /application form and submits', async () => {
    const page = new FakePage({ html: SIMPLE_FORM });
    const out = await ashbyApplyAdapter.apply(page, candidate());
    expect(out.outcome).toBe('SUBMITTED');
    expect(page.currentUrl).toBe('https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff/application');
    expect(page.fills).toContainEqual(['input[name="_systemfield_name"]', 'Ada Lovelace']);
    expect(page.fills).toContainEqual(['input[name="_systemfield_email"]', 'dev@example.com']);
    expect(page.fills).toContainEqual(['[id="1ed7df4b-e6d4-484e-92c3-4a5f5e07fd0c"]', 'I would love to build at Linear.']);
    expect(page.uploads).toEqual([{ selector: 'input#_systemfield_resume', files: ['/tmp/cv.pdf'] }]);
    expect(page.clicks).toEqual(['button.ashby-application-form-submit-button']);
    if (out.outcome === 'SUBMITTED') expect(out.url).toContain('/application');
  });

  it('stays on the page when already at /application', async () => {
    const page = new FakePage({ html: SIMPLE_FORM, url: 'https://jobs.ashbyhq.com/acme/42/application' });
    const out = await ashbyApplyAdapter.apply(page, candidate());
    expect(out.outcome).toBe('SUBMITTED');
    expect(page.currentUrl).toBe('https://jobs.ashbyhq.com/acme/42/application');
  });

  it('stops with MISSING_INFO on the real Linear fixture (required questions we cannot answer, plus reCAPTCHA)', async () => {
    const page = new FakePage({ html: FIXTURE });
    const out = await ashbyApplyAdapter.apply(page, candidate());
    // The real Linear form carries reCAPTCHA, which the shared stop scan
    // catches first; either stop is correct and nothing is ever submitted.
    expect(out.outcome).toBe('STOP');
    if (out.outcome === 'STOP') {
      expect(['CAPTCHA', 'MISSING_INFO']).toContain(out.code);
    }
    expect(page.clicks).toEqual([]);
  });

  it('fills a prepared answer when the label matches a prepared question', async () => {
    const page = new FakePage({ html: SIMPLE_FORM });
    const out = await ashbyApplyAdapter.apply(page, candidate({
      coverLetter: null,
      answers: [{ question: 'Cover letter', answer: 'Prepared cover letter text.' }],
    }));
    expect(out.outcome).toBe('SUBMITTED');
    expect(page.fills).toContainEqual(['[id="1ed7df4b-e6d4-484e-92c3-4a5f5e07fd0c"]', 'Prepared cover letter text.']);
  });

  it('stops with UNSUPPORTED_FORM when the Ashby structure is missing', async () => {
    const page = new FakePage({
      html: '<html><body><form><input type="text"/><button type="submit">Go</button></form></body></html>',
      present: [],
    });
    const out = await ashbyApplyAdapter.apply(page, candidate());
    expect(out).toMatchObject({ outcome: 'STOP', code: 'UNSUPPORTED_FORM' });
  });

  it('stops with MISSING_INFO when there is no CV file', async () => {
    const page = new FakePage({ html: SIMPLE_FORM });
    const out = await ashbyApplyAdapter.apply(page, candidate({ cvPath: null }));
    expect(out).toMatchObject({ outcome: 'STOP', code: 'MISSING_INFO' });
    expect(page.clicks).toEqual([]);
  });

  it('stops with MISSING_INFO listing required questions it cannot answer', async () => {
    const page = new FakePage({ html: SIMPLE_FORM });
    const out = await ashbyApplyAdapter.apply(page, candidate({ coverLetter: null }));
    expect(out).toMatchObject({ outcome: 'STOP', code: 'MISSING_INFO' });
    if (out.outcome === 'STOP') expect(out.message).toContain('Cover letter');
    expect(page.clicks).toEqual([]);
  });
});
