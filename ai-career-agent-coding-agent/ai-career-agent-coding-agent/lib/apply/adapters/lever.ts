import { firstMatch, readSignals, splitName, stopIfUnsafe } from './shared';
import type { ApplyCandidate, ApplyOutcome, ApplyPage, SiteApplyAdapter } from '../types';

/**
 * Lever application form (jobs.lever.co / *.lever.co).
 *
 * Same guarantees as the Greenhouse adapter: fill only positively-identified
 * fields, re-check stop conditions before the final click, never guess.
 */

const NAME_FIELDS = {
  name: ['input[name="name"]', 'input[placeholder*="full name" i]'],
  email: ['input[name="email"]', 'input[type="email"]'],
  phone: ['input[name="phone"]'],
  resume: ['input[type="file"][name="resume"]', 'input[type="file"]'],
  cover: ['textarea[name="comments"]', 'textarea[name="coverLetter"]', 'textarea[placeholder*="additional" i]'],
  submit: ['button[type="submit"]', 'input[type="submit"]'],
};

async function fillField(page: ApplyPage, selectors: string[], value: string): Promise<boolean> {
  const sel = await firstMatch(page, selectors);
  if (!sel) return false;
  await page.fill(sel, value);
  return true;
}

export const leverApplyAdapter: SiteApplyAdapter = {
  id: 'lever',
  label: 'Lever',
  domains: ['lever.co', 'jobs.lever.co'],
  matches(url: URL) {
    const h = url.hostname.toLowerCase();
    return h === 'jobs.lever.co' || h.endsWith('.lever.co');
  },
  async apply(page: ApplyPage, candidate: ApplyCandidate): Promise<ApplyOutcome> {
    const unsafe = await stopIfUnsafe(page);
    if (unsafe) return unsafe;

    const fileSel = await firstMatch(page, NAME_FIELDS.resume);
    const submitSel = await firstMatch(page, NAME_FIELDS.submit);
    if (!fileSel || !submitSel) {
      return { outcome: 'STOP', code: 'UNSUPPORTED_FORM', message: 'This Lever form does not match the supported structure.' };
    }

    if (!candidate.email || !candidate.name) {
      return { outcome: 'STOP', code: 'MISSING_INFO', message: 'Your application email and full name are required to submit.' };
    }

    const { first, last } = splitName(candidate.name);
    await fillField(page, NAME_FIELDS.name, [first, last].filter(Boolean).join(' '));
    await fillField(page, NAME_FIELDS.email, candidate.email);
    if (candidate.phone) await fillField(page, NAME_FIELDS.phone, candidate.phone);

    if (candidate.cvPath) await page.setInputFiles(fileSel, [candidate.cvPath]);
    if (candidate.coverLetter) await fillField(page, NAME_FIELDS.cover, candidate.coverLetter);

    for (const qa of candidate.answers) {
      const sel = await firstMatch(page, [`textarea[name*="${qa.question.slice(0, 20)}"]`, 'textarea[placeholder]']);
      if (sel) await page.fill(sel, qa.answer);
    }

    const beforeSubmit = await stopIfUnsafe(page);
    if (beforeSubmit) return beforeSubmit;

    await page.click(submitSel);
    const { url } = await readSignals(page);
    return { outcome: 'SUBMITTED', confirmation: await page.title(), url };
  },
};
