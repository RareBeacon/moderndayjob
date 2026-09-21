import { readSignals, stopIfUnsafe } from './shared';
import type { ApplyCandidate, ApplyOutcome, ApplyPage, SiteApplyAdapter } from '../types';

/**
 * Ashby application form (jobs.ashbyhq.com/<org>/<jobId>/application).
 *
 * Structure verified live 2026-09-21 against a real rendered Linear form
 * (fixture: tests/fixtures/ashby-application.html):
 * - Stable system fields: input[name="_systemfield_name"],
 *   input[name="_systemfield_email"], input#_systemfield_resume (file).
 * - The submit button carries the purpose-built class
 *   button.ashby-application-form-submit-button ("Submit Application").
 *   Other type=submit buttons exist ("Upload file", Yes/No) and must never
 *   be clicked, so the specific class is the only safe submit selector.
 * - Company questions are UUID-named inputs/textareas paired with
 *   <label for="<uuid>">, discovered by parsing the rendered HTML. IDs can
 *   start with a digit, so fields are addressed with [id="..."] attribute
 *   selectors, never "#id".
 * - Some employers add reCAPTCHA (Linear does): the shared stop scan sees
 *   it and the adapter stops; we never bypass a human check.
 *
 * Like the other adapters this is honest: required questions we cannot
 * answer from the candidate's verified profile stop with MISSING_INFO
 * instead of guessing, and live submission stays behind the global kill
 * switch until the owner verifies real forms end to end. (2026-09 note:
 * Ashby has been observed flagging automated-looking submissions as spam,
 * one more reason the kill switch and human review gates stay on.)
 */

const NAME_SEL = 'input[name="_systemfield_name"]';
const EMAIL_SEL = 'input[name="_systemfield_email"]';
const RESUME_SEL = 'input#_systemfield_resume';
const SUBMIT_SEL = 'button.ashby-application-form-submit-button';

export interface AshbyField {
  /** The element id (a UUID, possibly starting with a digit). */
  id: string;
  tag: string;
  required: boolean;
  /** Label text from the paired <label for>, '' when absent. */
  label: string;
}

/** Parse the rendered Ashby form: <label for="id"> pairs with UUID fields. */
export function parseAshbyFields(html: string): AshbyField[] {
  const labelById = new Map<string, string>();
  const labelRe = /<label\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g;
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(html))) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) labelById.set(m[1], text);
  }

  const fields: AshbyField[] = [];
  const fieldRe = /<(input|textarea)\b([^>]*)>/g;
  while ((m = fieldRe.exec(html))) {
    const attrs = m[2];
    const idMatch = /\bid="([^"]+)"/.exec(attrs);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (id.startsWith('_systemfield')) continue; // filled explicitly
    if (id === 'g-recaptcha-response') continue; // not a fillable question
    if (!/\bname="([^"]*)"/.test(attrs)) continue;
    const required = /\brequired\b/.test(attrs) || /aria-required="true"/.test(attrs);
    fields.push({ id, tag: m[1], required, label: labelById.get(id) ?? '' });
  }
  return fields;
}

function answerFor(label: string, answers: { question: string; answer: string }[]): string | null {
  const norm = label.toLowerCase();
  for (const qa of answers) {
    const q = qa.question.trim().toLowerCase();
    if (q && (norm.includes(q) || (q.length >= 8 && q.includes(norm)))) return qa.answer;
  }
  return null;
}

export const ashbyApplyAdapter: SiteApplyAdapter = {
  id: 'ashby',
  label: 'Ashby',
  domains: ['jobs.ashbyhq.com'],
  matches(url: URL) {
    return url.hostname.toLowerCase() === 'jobs.ashbyhq.com';
  },

  async apply(page: ApplyPage, candidate: ApplyCandidate): Promise<ApplyOutcome> {
    // The engine lands on the posting page; the form lives at /application.
    if (!page.url().endsWith('/application')) {
      await page.goto(`${page.url().replace(/\/+$/, '')}/application`);
    }

    let unsafe = await stopIfUnsafe(page);
    if (unsafe) return unsafe;

    // Structure check: the Ashby system fields must all be present.
    if (!(await page.has(NAME_SEL)) || !(await page.has(EMAIL_SEL)) || !(await page.has(RESUME_SEL))) {
      return { outcome: 'STOP', code: 'UNSUPPORTED_FORM', message: 'This Ashby form does not match the supported structure.' };
    }
    if (!(await page.has(SUBMIT_SEL))) {
      return { outcome: 'STOP', code: 'SUBMIT_UNCLEAR', message: 'Could not confirm the Ashby submit button; nothing was sent.' };
    }
    if (!candidate.email || !candidate.name) {
      return { outcome: 'STOP', code: 'MISSING_INFO', message: 'Your application email and full name are required to submit.' };
    }

    await page.fill(NAME_SEL, candidate.name);
    await page.fill(EMAIL_SEL, candidate.email);
    if (!candidate.cvPath) {
      return { outcome: 'STOP', code: 'MISSING_INFO', message: 'A CV file is required for this Ashby form.' };
    }
    await page.setInputFiles(RESUME_SEL, [candidate.cvPath]);

    // Company questions: cover letter, then prepared answers by label,
    // then an honest audit of anything required we still cannot answer.
    const fields = parseAshbyFields(await page.content());
    const unfilled: string[] = [];
    for (const f of fields) {
      if (/cover\s*letter/i.test(f.label) && candidate.coverLetter) {
        await page.fill(`[id="${f.id}"]`, candidate.coverLetter);
        continue;
      }
      const prepared = answerFor(f.label, candidate.answers);
      if (prepared) {
        await page.fill(`[id="${f.id}"]`, prepared);
        continue;
      }
      if (f.required) unfilled.push(f.label || 'an unnamed required question');
    }
    if (unfilled.length) {
      const listed = unfilled.slice(0, 4).join('; ');
      const more = unfilled.length > 4 ? ` (+${unfilled.length - 4} more)` : '';
      return {
        outcome: 'STOP',
        code: 'MISSING_INFO',
        message: `This form asks questions we cannot answer from your profile yet: ${listed}${more}. Add them to your profile or apply manually from the link.`,
      };
    }

    // Re-check right before the irreversible click (the form may have changed).
    const beforeSubmit = await stopIfUnsafe(page);
    if (beforeSubmit) return beforeSubmit;

    await page.click(SUBMIT_SEL);
    const { url } = await readSignals(page);
    return { outcome: 'SUBMITTED', confirmation: await page.title(), url };
  },
};
