/** Deterministic ATS-style resume scanner, no AI, no credits, no claims.
 *
 * This scores STRUCTURE and PARSEABILITY of pasted CV text against a fixed
 * public rubric. It never judges the person. Every finding states exactly
 * what was checked. Optional job description adds deterministic keyword
 * overlap (frequency-based extraction, stopword-filtered).
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface AtsFinding {
  check: string;
  status: CheckStatus;
  detail: string;
  tip?: string;
}

export interface AtsResult {
  score: number; // 0-100, weighted rubric
  findings: AtsFinding[];
  stats: { words: number; bullets: number };
  keywords?: { matched: string[]; missing: string[] };
}

const ACTION_VERBS = [
  'led', 'built', 'managed', 'delivered', 'designed', 'launched', 'improved', 'increased',
  'reduced', 'created', 'developed', 'implemented', 'coordinated', 'negotiated', 'trained',
  'mentored', 'analyzed', 'automated', 'migrated', 'scaled', 'owned', 'drove', 'shipped',
  'resolved', 'streamlined', 'established', 'spearheaded', 'optimized', 'supervised', 'produced',
];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'will', 'are', 'have', 'has', 'this', 'that',
  'from', 'they', 'their', 'who', 'was', 'were', 'not', 'but', 'can', 'all', 'any', 'each', 'into',
  'more', 'most', 'other', 'some', 'such', 'than', 'only', 'own', 'same', 'well', 'also', 'may',
  'should', 'would', 'could', 'must', 'shall', 'might', 'upon', 'about', 'across', 'among', 'while',
  'when', 'where', 'what', 'which', 'how', 'why', 'who', 'whom', 'its', 'it’s', "it's", 'a', 'an',
  'of', 'in', 'on', 'at', 'to', 'by', 'or', 'as', 'is', 'be', 'we', 'us', 'if', 'so', 'do', 'does',
  'job', 'role', 'work', 'working', 'team', 'teams', 'company', 'candidate', 'candidates', 'ability',
  'year', 'years', 'experience', 'experienced', 'strong', 'good', 'great', 'excellent', 'new', 'using',
  'use', 'used', 'including', 'include', 'includes', 'etc', 'within', 'plus', 'related', 'required',
  'requirements', 'responsibilities', 'opportunity', 'looking', 'seeking', 'join', 'help', 'make',
]);

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

/** Frequency-based keyword extraction (deterministic, no model). */
export function extractKeywords(jd: string, top = 12): string[] {
  const counts = new Map<string, number>();
  for (const raw of jd.toLowerCase().split(/[^a-z0-9+#./-]+/)) {
    const w = raw.replace(/^[./-]+|[./-]+$/g, '');
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([w]) => w);
}

export function scanResume(resumeText: string, jobDescription?: string): AtsResult {
  const text = resumeText.trim();
  const lower = text.toLowerCase();
  const words = countWords(text);
  const bullets = (text.match(/^[•\-*]\s+/gm) ?? []).length;
  const findings: AtsFinding[] = [];
  const weights: Array<{ earned: number; total: number }> = [];
  const add = (check: string, status: CheckStatus, detail: string, tip: string | undefined, total: number) => {
    findings.push({ check, status, detail, tip });
    weights.push({ earned: status === 'pass' ? total : status === 'warn' ? total / 2 : 0, total });
  };

  // 1. Length
  if (words < 180) add('Length', 'fail', `${words} words, too thin for most parsers to find substance.`, 'Aim for 350+ words covering roles and results.', 12);
  else if (words < 350) add('Length', 'warn', `${words} words, on the light side.`, 'Most strong CVs land between 350 and 1,200 words.', 12);
  else if (words <= 1200) add('Length', 'pass', `${words} words, a healthy, parseable length.`, undefined, 12);
  else add('Length', 'warn', `${words} words, very long; recruiters skim.`, 'Trim to what matters for the target role.', 12);

  // 2. Email
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(text);
  add('Contact email', hasEmail ? 'pass' : 'fail', hasEmail ? 'Email found.' : 'No email address found.', hasEmail ? undefined : 'Add a professional email at the top.', 12);

  // 3. Phone
  const hasPhone = /(\+?\d[\d\s().-]{7,}\d)/.test(text);
  add('Phone number', hasPhone ? 'pass' : 'fail', hasPhone ? 'Phone number found.' : 'No phone number found.', hasPhone ? undefined : 'Include a phone number with country code.', 10);

  // 4. Core sections
  const sections = [
    ['Experience', /experience|employment|work history/.test(lower)],
    ['Education', /education|degree|qualification/.test(lower)],
    ['Skills', /skills|competenc|technolog|tools/.test(lower)],
  ] as const;
  const found = sections.filter(([, ok]) => ok).length;
  const missing = sections.filter(([, ok]) => !ok).map(([n]) => n);
  add(
    'Core sections',
    found === 3 ? 'pass' : found === 2 ? 'warn' : 'fail',
    `${found} of 3 standard sections detected${missing.length ? `, missing: ${missing.join(', ')}` : ''}.`,
    'Use plain headings: Experience, Education, Skills.',
    16,
  );

  // 5. Dates
  const hasYears = /\b(19|20)\d{2}\b/.test(text);
  add('Dates', hasYears ? 'pass' : 'fail', hasYears ? 'Year references found.' : 'No dates detected, parsers use them to build your timeline.', 'Add start/end years to each role (e.g. 2022-2024).', 8);

  // 6. Action verbs
  const verbHits = ACTION_VERBS.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(text));
  if (verbHits.length >= 6) add('Action verbs', 'pass', `${verbHits.length} distinct action verbs (e.g. “${verbHits[0]}”).`, undefined, 12);
  else if (verbHits.length >= 3) add('Action verbs', 'warn', `Only ${verbHits.length} distinct action verbs.`, 'Start bullets with verbs: led, built, reduced, delivered…', 12);
  else add('Action verbs', 'fail', 'Almost no action verbs found.', 'Rewrite bullets to start with strong verbs.', 12);

  // 7. First person
  const firstPerson = /\b(i|my|me|mine)\b/i.test(text);
  add('First person', firstPerson ? 'warn' : 'pass', firstPerson ? 'First-person pronouns detected.' : 'No first-person pronouns, good.', 'CVs read stronger without “I”; let the verbs work.', 6);

  // 8. Emoji / decorative characters
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
  add('Special characters', emoji ? 'warn' : 'pass', emoji ? 'Emoji or symbols detected.' : 'No emoji or decorative symbols.', 'Some parsers drop lines containing emoji.', 4);

  // 9. Keyword match (only when a JD is provided)
  let keywords: AtsResult['keywords'];
  if (jobDescription && jobDescription.trim().length >= 30) {
    const kws = extractKeywords(jobDescription);
    const matched = kws.filter((k) => lower.includes(k));
    const missingKw = kws.filter((k) => !lower.includes(k));
    keywords = { matched, missing: missingKw };
    const ratio = kws.length === 0 ? 1 : matched.length / kws.length;
    add(
      'Role keywords',
      ratio >= 0.6 ? 'pass' : ratio >= 0.3 ? 'warn' : 'fail',
      `${matched.length} of ${kws.length} key terms from the job description appear in your CV.`,
      missingKw.length ? `Consider working in (truthfully): ${missingKw.slice(0, 6).join(', ')}.` : undefined,
      20,
    );
  }

  const total = weights.reduce((n, w) => n + w.total, 0);
  const earned = weights.reduce((n, w) => n + w.earned, 0);
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { score, findings, stats: { words, bullets }, keywords };
}
