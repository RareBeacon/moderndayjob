/**
 * Sensitive-question policy (Master Implementation Package B-184, §161-163,
 * DoD 11). These categories are NEVER auto-answered: the agent must surface
 * them to the user with the plain-language explanation below. A question
 * classified sensitive is excluded from auto-filled answers and the apply
 * package is marked "needs your answer" for that field.
 */
export type SensitiveCategory =
  | 'work_authorization'
  | 'salary_expectations'
  | 'demographic'
  | 'criminal_history'
  | 'legal_agreements'
  | 'disability'
  | 'other_personal';

export interface SensitiveMatch {
  category: SensitiveCategory;
  /** Plain-language reason shown to the user. */
  guidance: string;
}

interface Rule {
  category: SensitiveCategory;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    category: 'work_authorization',
    patterns: [
      /work authorization/i, /authorized to work/i, /require sponsorship/i,
      /visa sponsorship/i, /\bvisa\b/i, /visa status/i, /right to work/i, /citizenship/i, /are you a citizen/i,
      /immigration status/i, /permanent residenc/i, /will you now or in the future require/i,
    ],
  },
  {
    category: 'salary_expectations',
    patterns: [
      /salary expectation/i, /desired salary/i, /expected salary/i, /expected compensation/i,
      /desired compensation/i, /compensation expectation/i, /pay expectation/i, /salary range/i,
      /what salary/i, /compensation requirements/i, /notice period/i, /earliest start date/i,
      /start date/i,
    ],
  },
  {
    category: 'demographic',
    patterns: [
      /gender/i, /race\b/i, /ethnicity/i, /age\b/i, /date of birth/i, /marital status/i,
      /pregnan/i, /religion/i, /sexual orientation/i, /veteran status/i,
      /equal opportunity employer.*voluntary/i, /self[- ]identify/i, /pronouns/i,
      /national origin/i, /identify as\b/i, /\ba veteran\b/i, /veteran status/i,
    ],
  },
  {
    category: 'criminal_history',
    patterns: [
      /criminal (history|record|background)/i, /conviction/i, /ever been convicted/i,
      /background check/i, /fair chance/i, /ban the box/i,
    ],
  },
  {
    category: 'legal_agreements',
    patterns: [
      /non[- ]compete/i, /non[- ]compitation/i, /confidentiality agreement/i,
      /nda\b/i, /arbitration/i, /intellectual property assignment/i, /ip assignment/i,
      /do you agree to/i, /consent to/i, /terms of (use|service|employment)/i,
      /acknowledge that/i, /i certify that/i, /at[- ]will employment/i,
    ],
  },
  {
    category: 'disability',
    patterns: [
      /disabilit/i, /medical condition/i, /mental health condition/i,
      /accommodation/i, / ada\b/i,
    ],
  },
];

/** Human guidance per category. */
export const GUIDANCE: Record<SensitiveCategory, string> = {
  work_authorization: 'This affects your legal work status. Answer it yourself so it is accurate for your situation.',
  salary_expectations: 'Only you know your number. We never negotiate or guess on your behalf.',
  demographic: 'This is personal identity information. It is yours to share or decline, never ours to fill in.',
  criminal_history: 'This is legally sensitive. Review and answer it yourself.',
  legal_agreements: 'This is a legal commitment. Read it yourself before agreeing to anything.',
  disability: 'This is personal medical information. It is yours to share or decline, never ours to fill in.',
  other_personal: 'This is personal information. Answer it yourself.',
};

/** True when a question is sensitive; returns the first matching category. */
export function classifyQuestion(question: string): SensitiveMatch | null {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(question))) {
      return { category: rule.category, guidance: GUIDANCE[rule.category] };
    }
  }
  return null;
}

/**
 * Split application questions into auto-fillable vs sensitive.
 * Sensitive ones are NEVER answered by the agent (B-184).
 */
export function partitionQuestions(
  questions: string[],
): { auto: string[]; sensitive: Array<{ question: string; match: SensitiveMatch }> } {
  const auto: string[] = [];
  const sensitive: Array<{ question: string; match: SensitiveMatch }> = [];
  for (const q of questions) {
    const match = classifyQuestion(q);
    if (match) sensitive.push({ question: q, match });
    else auto.push(q);
  }
  return { auto, sensitive };
}
