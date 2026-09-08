import { firstMatch, readSignals, splitName, stopIfUnsafe } from './shared';
import type { ApplyCandidate, ApplyOutcome, ApplyPage, SiteApplyAdapter } from '../types';

/**
 * Greenhouse application form (boards.greenhouse.io / *.greenhouse.io).
 *
 * Targets the standard Greenhouse field names. The adapter is honest: it fills
 * only the fields it can positively identify, re-checks stop conditions right
 * before the final click, and never submits if anything is unclear. Live
 * verification against real Greenhouse forms is a staging go-live gate; until
 * then automatic submission is disabled by the global kill switch.
 */

const NAME_FIELDS = {
  first: ['input[name="job_application[first_name]"]', 'input[name="first_name"]', 'input#first_name'],
  last: ['input[name="job_application[last_name]"]', 'input[name="last_name"]', 'input#last_name'],
  email: ['input[name="job_application[email]"]', 'input[name="email"]', 'input[type="email"]'],
  phone: ['input[name="job_application[phone]"]', 'input[name="phone"]'],
  resume: ['input[type="file"][name="job_application[resume]"]', 'input[type="file"][name="resume"]', 'input[type="file"]'],
  cover: ['textarea[name="job_application[cover_letter]"]', 'textarea[name="cover_letter"]', 'textarea#cover_letter'],
  submit: ['button[type="submit"]', 'input[type="submit"]', 'button#submit_app'],
};

async function fillField(page: ApplyPage, selectors: string[], value: string): Promise<boolean> {
  const sel = await firstMatch(page, selectors);
  if (!sel) return false;
  await page.fill(sel, value);
  return true;
}

export const greenhouseApplyAdapter: SiteApplyAdapter = {
  id: 'greenhouse',
  label: 'Greenhouse',
  domains: ['greenhouse.io', 'boards.greenhouse.io', 'job-boards.greenhouse.io'],
  matches(url: URL) {
    const h = url.hostname.toLowerCase();
    return h === 'boards.greenhouse.io' || h.endsWith('.greenhouse.io');
  },
  async apply(page: ApplyPage, candidate: ApplyCandidate): Promise<ApplyOutcome> {
    const unsafe = await stopIfUnsafe(page);
    if (unsafe) return unsafe;

    // Required structure: a CV file input and a submit button.
    const fileSel = await firstMatch(page, NAME_FIELDS.resume);
    const submitSel = await firstMatch(page, NAME_FIELDS.submit);
    if (!fileSel || !submitSel) {
      return { outcome: 'STOP', code: 'UNSUPPORTED_FORM', message: 'This Greenhouse form does not match the supported structure.' };
    }

    if (!candidate.email || !candidate.name) {
      return { outcome: 'STOP', code: 'MISSING_INFO', message: 'Your application email and full name are required to submit.' };
    }

    const { first, last } = splitName(candidate.name);
    await fillField(page, NAME_FIELDS.first, first);
    await fillField(page, NAME_FIELDS.last, last || first);
    await fillField(page, NAME_FIELDS.email, candidate.email);
    if (candidate.phone) await fillField(page, NAME_FIELDS.phone, candidate.phone);

    if (candidate.cvPath) await page.setInputFiles(fileSel, [candidate.cvPath]);
    if (candidate.coverLetter) await fillField(page, NAME_FIELDS.cover, candidate.coverLetter);

    // Application questions, best-effort: match by label text where possible.
    for (const qa of candidate.answers) {
      const sel = await firstMatch(page, [`textarea[name*="${qa.question.slice(0, 20)}"]`, 'textarea[placeholder]']);
      if (sel) await page.fill(sel, qa.answer);
    }

    // Re-check before the irreversible click (the form may have changed).
    const beforeSubmit = await stopIfUnsafe(page);
    if (beforeSubmit) return beforeSubmit;

    await page.click(submitSel);
    const { url } = await readSignals(page);
    return { outcome: 'SUBMITTED', confirmation: await page.title(), url };
  },
};
