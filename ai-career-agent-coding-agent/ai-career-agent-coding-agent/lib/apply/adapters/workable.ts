import { hasSuccessSignal, unverifiedSubmissionOutcome, readSignals, splitName, stopIfUnsafe } from './shared';
import type { ApplyCandidate, ApplyOutcome, ApplyPage, SiteApplyAdapter } from '../types';

/**
 * Workable application form (apply.workable.com/j/{shortcode}/apply).
 *
 * Structure verified live 2026-09-21 against a real rendered Workable form
 * (fixture: tests/fixtures/workable-application.html):
 * - Stable, purpose-built attributes: the resume upload is
 *   input[type="file"][data-ui="resume"] (a second file input with
 *   data-ui="avatar" exists and must never be touched), and the submit
 *   button is button[data-ui="apply-button"] ("Submit application").
 * - Named fields: #firstname, #lastname, #email, input[name="phone"],
 *   textarea#cover_letter (all optional except the identity fields).
 * - The form URL is the job URL + "/apply".
 * - Some boards add reCAPTCHA (the probed one did): the shared stop scan
 *   sees it and the adapter stops; we never bypass a human check. Cookie
 *   consent banners may also appear per board; whether they block clicks
 *   is part of the live go-live verification with the real browser worker,
 *   behind the global kill switch like every adapter.
 */

const FIRST_SEL = '#firstname';
const LAST_SEL = '#lastname';
const EMAIL_SEL = '#email';
const PHONE_SEL = 'input[name="phone"]';
const COVER_SEL = '#cover_letter';
const RESUME_SEL = 'input[type="file"][data-ui="resume"]';
const SUBMIT_SEL = 'button[data-ui="apply-button"]';

export const workableApplyAdapter: SiteApplyAdapter = {
  id: 'workable',
  label: 'Workable',
  domains: ['apply.workable.com'],
  matches(url: URL) {
    return url.hostname.toLowerCase() === 'apply.workable.com';
  },

  async apply(page: ApplyPage, candidate: ApplyCandidate): Promise<ApplyOutcome> {
    // The job URL is apply.workable.com/j/{code}; the form is + "/apply".
    if (!/\/apply\/?$/.test(page.url())) {
      await page.goto(`${page.url().replace(/\/+$/, '')}/apply`);
    }

    let unsafe = await stopIfUnsafe(page);
    if (unsafe) return unsafe;

    // Structure check: named identity fields, the resume input, the submit button.
    if (
      !(await page.has(FIRST_SEL)) ||
      !(await page.has(LAST_SEL)) ||
      !(await page.has(EMAIL_SEL)) ||
      !(await page.has(RESUME_SEL)) ||
      !(await page.has(SUBMIT_SEL))
    ) {
      return { outcome: 'STOP', code: 'UNSUPPORTED_FORM', message: 'This Workable form does not match the supported structure.' };
    }
    if (!candidate.email || !candidate.name) {
      return { outcome: 'STOP', code: 'MISSING_INFO', message: 'Your application email and full name are required to submit.' };
    }

    const { first, last } = splitName(candidate.name);
    await page.fill(FIRST_SEL, first);
    await page.fill(LAST_SEL, last || first);
    await page.fill(EMAIL_SEL, candidate.email);
    if (candidate.phone) await page.fill(PHONE_SEL, candidate.phone);
    if (candidate.coverLetter) await page.fill(COVER_SEL, candidate.coverLetter);

    if (!candidate.cvPath) {
      return { outcome: 'STOP', code: 'MISSING_INFO', message: 'A CV file is required for this Workable form.' };
    }
    await page.setInputFiles(RESUME_SEL, [candidate.cvPath]);

    // Re-check right before the irreversible click (the form may have changed).
    const beforeSubmit = await stopIfUnsafe(page);
    if (beforeSubmit) return beforeSubmit;

    await page.click(SUBMIT_SEL);
    const { url } = await readSignals(page);
    // M4 verification layer: SUBMITTED requires an explicit success
    // signal (confirmation URL or copy). Without one the outcome is
    // UNKNOWN and never auto-retried.
    if (!(await hasSuccessSignal(page))) return unverifiedSubmissionOutcome();
    return { outcome: 'SUBMITTED', confirmation: await page.title(), url };
  },
};
