import { isPlaceholder } from '@/lib/truthfulness/extract';
import type {
  AnswersOutput,
  CoverLetterOutput,
  CVOutput,
  GenerationJob,
  GenerationProfile,
  ReferenceSet,
} from './types';

/**
 * Provider label stored in source_facts when the route uses the local,
 * deterministic generator instead of waiting on a flaky upstream model.
 */
export const SAFE_FALLBACK_PROVIDER = 'jobiest_safe_facts_generator';

const SENTENCE_LIMIT = 300;

function asCleanString(value: unknown, max = 1000): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || isPlaceholder(text)) return '';
  return text.slice(0, max).trim();
}

function uniq(values: string[], max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const cleaned = asCleanString(v, 160);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

function list(values: string[], max = 6): string {
  return values.slice(0, max).join(', ');
}

function ensureSentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  if (/,$/.test(t)) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function sentenceChunks(text: string, maxItems = 4): string[] {
  const cleaned = asCleanString(text, 1400);
  if (!cleaned) return [];
  const pieces = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((p) => ensureSentence(p.slice(0, SENTENCE_LIMIT).trim()))
    .filter(Boolean);
  if (pieces.length) return pieces.slice(0, maxItems);
  return [ensureSentence(cleaned.slice(0, SENTENCE_LIMIT))];
}

function primaryRole(profile: GenerationProfile): string {
  return (
    asCleanString(profile.headline, 160) ||
    asCleanString(profile.targetRoles?.[0], 120) ||
    asCleanString(profile.experience?.[0]?.title, 120) ||
    'Professional profile'
  );
}

function summaryFromProfile(profile: GenerationProfile): string {
  const existing = asCleanString(profile.summary, 600);
  if (existing.length >= 20) return existing;

  const role = primaryRole(profile);
  const skills = uniq(profile.skills ?? [], 8);
  const targetRoles = uniq(profile.targetRoles ?? [], 4);
  const employers = uniq((profile.experience ?? []).map((e) => e.company ?? ''), 4);
  const schools = uniq((profile.education ?? []).map((e) => e.institution ?? ''), 3);

  const lines: string[] = [];
  if (role) lines.push(`${role} profile built from verified career facts.`);
  if (skills.length) lines.push(`Skills include ${list(skills)}.`);
  if (targetRoles.length) lines.push(`Target roles include ${list(targetRoles, 4)}.`);
  if (employers.length) lines.push(`Experience includes ${list(employers, 4)}.`);
  if (schools.length) lines.push(`Education includes ${list(schools, 3)}.`);

  const joined = lines.join(' ').trim();
  return joined.length >= 20 ? joined.slice(0, 600) : 'Professional profile generated from verified Jobiest career facts.';
}

export function referencesFromProfile(profile: GenerationProfile): ReferenceSet {
  return {
    employers: uniq((profile.experience ?? []).map((e) => e.company ?? ''), 20),
    schools: uniq((profile.education ?? []).map((e) => e.institution ?? ''), 20),
    skills: uniq(profile.skills ?? [], 40),
  };
}

/** Build a safe, ATS-readable CV without any upstream AI dependency. */
export function buildFallbackCV(profile: GenerationProfile): CVOutput {
  const role = primaryRole(profile);
  const skills = uniq(profile.skills ?? [], 40);
  const experiences = (profile.experience ?? [])
    .map((e) => {
      const company = asCleanString(e.company, 120);
      const title = asCleanString(e.title, 120);
      const bullets = sentenceChunks(e.description ?? '', 5);
      if (!bullets.length) {
        const fact = [title ? `Role: ${title}` : '', company ? `Company: ${company}` : '']
          .filter(Boolean)
          .join('. ');
        if (fact) bullets.push(ensureSentence(fact));
      }
      return { company, title, start: null, end: null, bullets };
    })
    .filter((e) => e.company || e.title || e.bullets.length)
    .slice(0, 15);

  return {
    headline: role.slice(0, 160),
    summary: summaryFromProfile(profile),
    experiences,
    skills,
    education: (profile.education ?? [])
      .map((e) => ({
        institution: asCleanString(e.institution, 160),
        qualification: asCleanString(e.qualification, 160),
      }))
      .filter((e) => e.institution || e.qualification)
      .slice(0, 10),
  };
}

/** Build a safe cover letter from verified profile facts only. */
export function buildFallbackCoverLetter(profile: GenerationProfile, _job?: GenerationJob): CoverLetterOutput {
  const role = primaryRole(profile);
  const skills = uniq(profile.skills ?? [], 12);
  const refs = referencesFromProfile(profile);
  const paragraphs = [
    'Dear hiring team,',
    `I am applying for this role with a profile grounded in my verified Jobiest facts as a ${role}.`,
  ];

  const summary = asCleanString(profile.summary, 700);
  if (summary) paragraphs.push(summary);

  const firstExperience = (profile.experience ?? [])
    .map((e) => {
      const title = asCleanString(e.title, 120);
      const company = asCleanString(e.company, 120);
      const description = asCleanString(e.description, 500);
      return [title, company, description].filter(Boolean).join(' - ');
    })
    .find(Boolean);
  if (firstExperience) paragraphs.push(`Relevant verified experience: ${firstExperience}`);

  if (skills.length) paragraphs.push(`My listed skills include ${list(skills, 12)}.`);

  const firstEducation = (profile.education ?? [])
    .map((e) => [asCleanString(e.qualification, 160), asCleanString(e.institution, 160)].filter(Boolean).join(' - '))
    .find(Boolean);
  if (firstEducation) paragraphs.push(`Education: ${firstEducation}.`);

  paragraphs.push('Thank you for reviewing my application. I would welcome the opportunity to discuss how these verified facts align with the role.');

  return { body: paragraphs.map(ensureSentence).join('\n\n'), references: refs };
}

/** Build safe application answers without treating untrusted questions as candidate claims. */
export function buildFallbackAnswers(profile: GenerationProfile, questions: string[]): AnswersOutput {
  const skills = uniq(profile.skills ?? [], 10);
  const summary = asCleanString(profile.summary, 700);
  const firstExperience = (profile.experience ?? [])
    .map((e) => [asCleanString(e.title, 120), asCleanString(e.company, 120), asCleanString(e.description, 500)].filter(Boolean).join(' - '))
    .find(Boolean);
  const fallbackFacts = [summary, firstExperience, skills.length ? `Skills: ${list(skills, 10)}.` : '']
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    answers: questions.map((q) => ({
      question: asCleanString(q, 1000) || 'Application question',
      answer: fallbackFacts
        ? `Based on my verified Jobiest profile: ${fallbackFacts}`
        : 'I do not have a verified answer for this in my profile yet.',
    })),
    references: referencesFromProfile(profile),
  };
}
