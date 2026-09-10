import type { AITask } from '@packages/ai/types';
import { verifyDocument } from '@/lib/truthfulness/verify';
import { toTruthfulProfile } from '@/lib/generation/service';
import { referencesFromProfile } from '@/lib/generation/fallback';
import type { GenerationProfile } from '@/lib/generation/types';
import {
  ANALYZE_JOB_TASK,
  CAREER_PATHS_TASK,
  FOLLOWUP_EMAIL_TASK,
  INTERVIEW_QUESTIONS_TASK,
  LINKEDIN_HEADLINE_TASK,
  PROFILE_SUMMARY_TASK,
  SALARY_INSIGHTS_TASK,
  type CareerPathsOutput,
  type FollowupEmailOutput,
  type InterviewQuestionsOutput,
  type JobAnalysisOutput,
  type ProfileCopyOutput,
  type SalaryInsightsOutput,
} from './task';

/** Provider label for deterministic free-tool fallbacks. */
export const SAFE_ANALYSIS_PROVIDER = 'jobiest_safe_tool_generator';

/** Structural gateway dependency (the real AIGateway satisfies this). */
export interface AnalysisGateway {
  run<I, O>(task: AITask<I, O>, input: I): Promise<{ data: O; provider: string }>;
}

export interface JobAnalysis extends JobAnalysisOutput {
  matchedSkills: string[];
  missingSkills: string[];
}

interface MaybeGatewayInput {
  gateway?: AnalysisGateway;
  deterministicOnly?: boolean;
}

/**
 * Deterministic, case-insensitive skill comparison with containment matching,
 * so "React" matches "react.js" (and vice versa) in either direction.
 * Pure, fully unit-testable.
 */
export function compareSkills(required: string[], userSkills: string[]): { matched: string[]; missing: string[] } {
  const norm = (s: string) => s.trim().toLowerCase();
  const user = userSkills.map(norm).filter(Boolean);
  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of required) {
    const r = norm(skill);
    if (!r) continue;
    const hit = user.some((u) => u === r || (u.length >= 3 && r.includes(u)) || (r.length >= 3 && u.includes(r)));
    (hit ? matched : missing).push(skill);
  }
  return { matched, missing };
}

/**
 * Analyze a job description. Upstream AI is optional: if it fails, is disabled,
 * or returns an invalid draft, the deterministic analyzer still returns useful
 * extracted keywords and skill matches instead of surfacing a provider error.
 */
export async function analyzeJob(input: MaybeGatewayInput & {
  jobDescription: string;
  userSkills: string[];
}): Promise<JobAnalysis & { provider: string }> {
  if (!input.deterministicOnly && input.gateway) {
    try {
      const { data, provider } = await input.gateway.run(ANALYZE_JOB_TASK, {
        jobDescription: input.jobDescription,
      });
      const { matched, missing } = compareSkills(data.requiredSkills, input.userSkills);
      return { ...data, matchedSkills: matched, missingSkills: missing, provider };
    } catch {
      // Fall through to the deterministic analyzer.
    }
  }
  const data = buildFallbackJobAnalysis(input.jobDescription);
  const { matched, missing } = compareSkills(data.requiredSkills, input.userSkills);
  return { ...data, matchedSkills: matched, missingSkills: missing, provider: SAFE_ANALYSIS_PROVIDER };
}

/** Generate interview practice questions grounded in the listing text. */
export async function generateInterviewQuestions(input: MaybeGatewayInput & {
  jobDescription: string;
}): Promise<InterviewQuestionsOutput & { provider: string }> {
  if (!input.deterministicOnly && input.gateway) {
    try {
      const { data, provider } = await input.gateway.run(INTERVIEW_QUESTIONS_TASK, {
        jobDescription: input.jobDescription,
      });
      return { ...data, provider };
    } catch {
      // Fall through to deterministic questions.
    }
  }
  return { ...buildFallbackInterviewQuestions(input.jobDescription), provider: SAFE_ANALYSIS_PROVIDER };
}

export type ProfileCopyKind = 'SUMMARY' | 'HEADLINE';

/**
 * Generate resume-summary or LinkedIn-headline options from verified profile
 * facts, then run the deterministic truthfulness checker over the result.
 */
export async function generateProfileCopy(input: MaybeGatewayInput & {
  kind: ProfileCopyKind;
  profile: GenerationProfile;
}): Promise<{ kind: ProfileCopyKind; options: string[]; report: ReturnType<typeof verifyDocument>; provider: string }> {
  if (!input.deterministicOnly && input.gateway) {
    try {
      const task = input.kind === 'HEADLINE' ? LINKEDIN_HEADLINE_TASK : PROFILE_SUMMARY_TASK;
      const { data, provider } = await input.gateway.run(task, { profile: input.profile });
      const result = profileCopyResult(input.kind, data, input.profile, provider);
      if (result.report.passed) return result;
    } catch {
      // Fall through to deterministic profile copy.
    }
  }
  return profileCopyResult(input.kind, buildFallbackProfileCopy(input.kind, input.profile), input.profile, SAFE_ANALYSIS_PROVIDER);
}

/** Follow-up email, drafted from user-supplied facts (no qualification claims). */
export async function generateFollowupEmail(input: MaybeGatewayInput & {
  company: string;
  role: string;
  daysSinceApplied: number;
  contactName?: string;
  note?: string;
}): Promise<{ subject: string; body: string; provider: string }> {
  if (!input.deterministicOnly && input.gateway) {
    try {
      const { data, provider } = await input.gateway.run(FOLLOWUP_EMAIL_TASK, {
        company: input.company,
        role: input.role,
        daysSinceApplied: input.daysSinceApplied,
        contactName: input.contactName,
        note: input.note,
      });
      return { subject: data.subject, body: data.body, provider };
    } catch {
      // Fall through to deterministic email.
    }
  }
  return { ...buildFallbackFollowupEmail(input), provider: SAFE_ANALYSIS_PROVIDER };
}

/**
 * Career path suggestions from verified skills. Deterministic guard: every
 * skill cited in `buildingOn` must exist in the profile skills.
 */
export async function generateCareerPaths(input: MaybeGatewayInput & {
  profile: GenerationProfile;
}): Promise<{ paths: CareerPathsOutput['paths']; summary: string; verified: boolean; unsupportedSkills: string[]; provider: string }> {
  const userSkills = input.profile.skills.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const supported = (cited: string) => {
    const c = cited.trim().toLowerCase();
    return userSkills.some((u) => u === c || (u.length >= 3 && c.includes(u)) || (c.length >= 3 && u.includes(c)));
  };

  const finish = (data: CareerPathsOutput, provider: string) => {
    const unsupportedSkills = Array.from(new Set(data.paths.flatMap((p) => p.buildingOn.filter((s) => !supported(s)))));
    return {
      paths: data.paths,
      summary: data.summary,
      verified: unsupportedSkills.length === 0,
      unsupportedSkills,
      provider,
    };
  };

  if (!input.deterministicOnly && input.gateway) {
    try {
      const { data, provider } = await input.gateway.run(CAREER_PATHS_TASK, { profile: input.profile });
      const result = finish(data, provider);
      if (result.verified) return result;
    } catch {
      // Fall through to deterministic paths.
    }
  }
  return finish(buildFallbackCareerPaths(input.profile), SAFE_ANALYSIS_PROVIDER);
}

/**
 * Salary insights from real listings. Deterministic extractor reports ONLY
 * ranges/amounts explicitly present in the scanned descriptions.
 */
export async function generateSalaryInsights(input: MaybeGatewayInput & {
  jobs: { id: string; title: string; company: string; description: string }[];
}): Promise<{ ranges: SalaryInsightsOutput['statedRanges']; notes: string; verified: boolean; provider: string }> {
  const finish = (data: SalaryInsightsOutput, provider: string) => {
    const ids = new Set(input.jobs.map((j) => j.id));
    const verified = data.statedRanges.every((r) => ids.has(r.jobId));
    return { ranges: data.statedRanges, notes: data.notes, verified, provider };
  };

  if (!input.deterministicOnly && input.gateway) {
    try {
      const { data, provider } = await input.gateway.run(SALARY_INSIGHTS_TASK, { jobs: input.jobs });
      const result = finish(data, provider);
      if (result.verified) return result;
    } catch {
      // Fall through to deterministic salary extraction.
    }
  }
  return finish(buildFallbackSalaryInsights(input.jobs), SAFE_ANALYSIS_PROVIDER);
}

function profileCopyResult(
  kind: ProfileCopyKind,
  data: ProfileCopyOutput,
  profile: GenerationProfile,
  provider: string,
): { kind: ProfileCopyKind; options: string[]; report: ReturnType<typeof verifyDocument>; provider: string } {
  const truthfulProfile = toTruthfulProfile(profile);
  const report = verifyDocument(
    {
      claimedEmployers: data.references.employers,
      claimedSchools: data.references.schools,
      claimedSkills: data.references.skills,
      text: data.options.join('\n'),
    },
    truthfulProfile,
  );
  return { kind, options: data.options, report, provider };
}

/* ---------- deterministic free-tool builders ---------- */

const KNOWN_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Python', 'Django', 'FastAPI',
  'SQL', 'PostgreSQL', 'MySQL', 'Excel', 'Power BI', 'Tableau', 'AWS', 'Azure', 'GCP',
  'Docker', 'Kubernetes', 'CI/CD', 'Git', 'REST API', 'GraphQL', 'HTML', 'CSS', 'Tailwind',
  'AI', 'Machine Learning', 'LLM', 'LangChain', 'LangGraph', 'n8n', 'Zapier', 'Automation',
  'Customer Success', 'Salesforce', 'HubSpot', 'Project Management', 'Agile', 'Scrum',
  'Data Analysis', 'Cybersecurity', 'UX', 'Figma', 'SEO', 'Content Marketing',
];

function cleanText(value: unknown, max = 1000): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
}

function uniq(values: string[], max = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const cleaned = cleanText(v, 160);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

function includesPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i').test(text);
}

function titleFromDescription(text: string): string | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const explicit = text.match(/\b(?:job title|title|role)\s*[:\-]\s*([^\n.]{2,120})/i)?.[1];
  const candidate = explicit || lines.find((l) => l.length >= 2 && l.length <= 90 && !/[.!?]$/.test(l));
  return candidate ? cleanText(candidate, 120) : null;
}

function seniorityFromText(text: string): string | null {
  return text.match(/\b(intern|junior|entry[- ]level|mid[- ]level|senior|lead|principal|manager|director)\b/i)?.[0] ?? null;
}

function employmentTypeFromText(text: string): string | null {
  return text.match(/\b(full[- ]time|part[- ]time|contract|temporary|internship|remote|hybrid)\b/i)?.[0] ?? null;
}

function locationFromText(text: string): string | null {
  const explicit = text.match(/\b(?:location|based in)\s*[:\-]\s*([^\n.]{2,120})/i)?.[1];
  if (explicit) return cleanText(explicit, 120);
  if (/\bremote\b/i.test(text)) return 'Remote';
  if (/\blagos\b/i.test(text)) return 'Lagos';
  return null;
}

function extractSkillsFromText(text: string): string[] {
  const found = KNOWN_SKILLS.filter((skill) => includesPhrase(text, skill));
  const explicit = Array.from(text.matchAll(/\b(?:skills?|requirements?|experience with)\s*[:\-]\s*([^\n.]{3,240})/gi))
    .flatMap((m) => m[1].split(/[,;|/]/))
    .map((s) => s.replace(/\b(and|or|required|preferred|experience with)\b/gi, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 60);
  return uniq([...found, ...explicit], 30);
}

function sentenceList(text: string, max = 6): string[] {
  const bullets = text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter((l) => l.length >= 15 && l.length <= 220);
  const sentences = cleanText(text, 5000)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 220);
  return uniq([...bullets, ...sentences], max);
}

function buildFallbackJobAnalysis(jobDescription: string): JobAnalysisOutput {
  const text = jobDescription || '';
  const title = titleFromDescription(text);
  const company = text.match(/\bcompany\s*[:\-]\s*([^\n.]{2,120})/i)?.[1] ?? null;
  const requiredSkills = extractSkillsFromText(text);
  const responsibilities = sentenceList(text, 10);
  const keywords = uniq([...requiredSkills, ...(title ? title.split(/\s+/) : []), ...(seniorityFromText(text) ? [seniorityFromText(text) as string] : [])], 30);
  const summary = title
    ? `The listing describes ${title}. Extracted skills and duties are limited to terms found in the job description.`
    : 'The listing was reviewed with deterministic extraction. Skills and duties are limited to terms found in the job description.';
  return {
    title,
    company: company ? cleanText(company, 160) : null,
    seniority: seniorityFromText(text),
    employmentType: employmentTypeFromText(text),
    location: locationFromText(text),
    requiredSkills,
    keywords,
    responsibilities,
    summary,
  };
}

function buildFallbackInterviewQuestions(jobDescription: string): InterviewQuestionsOutput {
  const analysis = buildFallbackJobAnalysis(jobDescription);
  const role = analysis.title;
  const skills = analysis.requiredSkills.slice(0, 4);
  const questions = [
    { question: `What responsibilities from this ${role ?? 'role'} are most important to prepare for?`, focus: 'Role understanding' },
    { question: `How would you approach the first week in this ${role ?? 'role'} based on the listing?`, focus: 'Planning' },
    { question: 'Which stated requirement in the job description is your strongest match?', focus: 'Evidence' },
    { question: 'Which stated requirement would you need to learn or strengthen first?', focus: 'Gap awareness' },
    ...skills.map((s) => ({ question: `How have you used ${s} in work relevant to this role?`, focus: s })),
    { question: 'What questions would you ask the hiring team about success in this role?', focus: 'Candidate questions' },
  ].slice(0, 8);
  return {
    role,
    questions,
    preparationTips: [
      'Review the stated responsibilities and prepare examples for each one.',
      'Map your verified skills to the listed requirements before the interview.',
      'Prepare honest gaps and a short learning plan for any missing requirement.',
      'Bring two questions about team goals, workflow, and success measures.',
    ],
  };
}

function buildFallbackProfileCopy(kind: ProfileCopyKind, profile: GenerationProfile): ProfileCopyOutput {
  const refs = referencesFromProfile(profile);
  const role = cleanText(profile.headline, 120) || cleanText(profile.targetRoles?.[0], 120) || cleanText(profile.experience?.[0]?.title, 120) || 'Professional';
  const skills = refs.skills;
  const summary = cleanText(profile.summary, 300);
  const skillText = skills.length ? skills.slice(0, 4).join(', ') : 'verified profile skills';
  const employer = refs.employers[0];

  if (kind === 'HEADLINE') {
    const options = uniq([
      `${role} | ${skillText}`,
      skills.length ? `${role} focused on ${skills.slice(0, 3).join(', ')}` : `${role} from verified career facts`,
      employer ? `${role} with experience at ${employer}` : `${role} with verified project experience`,
      skills[0] ? `${skills[0]} ${role}` : `${role} candidate`,
      `${role} | truthful, profile-based career facts`,
    ], 5).map((o) => (o.length < 10 ? `${o} profile` : o).slice(0, 120));
    while (options.length < 5) options.push(`${role} profile option ${options.length + 1}`.slice(0, 120));
    return { options, references: refs };
  }

  const base = summary || `${role} with verified experience and skills in ${skillText}.`;
  const options = [
    base,
    `${role} with a verified profile covering ${skillText}.`,
    employer ? `${role} with experience at ${employer} and skills including ${skillText}.` : `${role} with skills including ${skillText}.`,
  ].map((o) => (o.length < 20 ? `${o} Built from verified Jobiest profile facts.` : o).slice(0, 400));
  return { options, references: refs };
}

function buildFallbackFollowupEmail(input: {
  company: string;
  role: string;
  daysSinceApplied: number;
  contactName?: string;
  note?: string;
}): FollowupEmailOutput {
  const company = cleanText(input.company, 120);
  const role = cleanText(input.role, 160);
  const greeting = input.contactName ? `Hello ${cleanText(input.contactName, 120)},` : 'Hello,';
  const note = input.note ? `\n\n${cleanText(input.note, 500)}` : '';
  return {
    subject: `Follow-up on ${role} application`,
    body:
      `${greeting}\n\nI hope you are well. I am following up on my application for the ${role} role at ${company}, submitted ${input.daysSinceApplied} day(s) ago. I remain interested in the opportunity and would appreciate any update on the process when convenient.${note}\n\nThank you for your time.\n\nBest regards,`,
  };
}

function buildFallbackCareerPaths(profile: GenerationProfile): CareerPathsOutput {
  const skills = uniq(profile.skills ?? [], 10);
  const role = cleanText(profile.targetRoles?.[0], 80) || cleanText(profile.headline, 80) || 'Career direction';
  const primary = skills.slice(0, 3);
  const paths: CareerPathsOutput['paths'] = [
    {
      direction: role,
      why: primary.length ? `This path builds directly on your listed skills: ${primary.join(', ')}.` : 'This path is based on the target role saved in your profile.',
      buildingOn: primary,
      explore: ['Role requirements', 'Portfolio examples', 'Interview expectations'],
    },
    {
      direction: primary.some((s) => /ai|llm|langchain|n8n|automation/i.test(s)) ? 'AI automation specialist' : 'Skills-adjacent specialist role',
      why: primary.length ? `This direction keeps the focus on your strongest listed skills: ${primary.join(', ')}.` : 'This direction is a conservative adjacent option from your profile.',
      buildingOn: primary,
      explore: ['Adjacent job descriptions', 'Common tools', 'Entry requirements'],
    },
  ];
  if (skills.length > 3) {
    paths.push({
      direction: 'Technical implementation support',
      why: `This direction combines your additional listed skills: ${skills.slice(3, 6).join(', ')}.`,
      buildingOn: skills.slice(3, 6),
      explore: ['Support workflows', 'Implementation projects', 'Client delivery examples'],
    });
  }
  return {
    paths,
    summary: 'Exploratory directions generated from verified profile skills only. Treat them as research prompts, not guaranteed outcomes.',
  };
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)(\s?[kKmM])?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] ?? '').trim().toLowerCase();
  if (suffix === 'k') return n * 1000;
  if (suffix === 'm') return n * 1_000_000;
  return n;
}

function currencyFromText(text: string): string {
  if (/\bUSD\b|\$/i.test(text)) return 'USD';
  if (/\bGBP\b|£/i.test(text)) return 'GBP';
  if (/\bEUR\b|€/i.test(text)) return 'EUR';
  if (/\bNGN\b|₦/i.test(text)) return 'NGN';
  return 'stated';
}

function periodFromText(text: string): string {
  if (/\b(month|monthly|per month)\b/i.test(text)) return 'monthly';
  if (/\b(hour|hourly|per hour)\b/i.test(text)) return 'hourly';
  if (/\b(day|daily|per day)\b/i.test(text)) return 'daily';
  return 'annual';
}

function buildFallbackSalaryInsights(jobs: { id: string; title: string; company: string; description: string }[]): SalaryInsightsOutput {
  const statedRanges: SalaryInsightsOutput['statedRanges'] = [];
  for (const job of jobs) {
    const text = `${job.title}\n${job.company}\n${job.description}`;
    const range = text.match(/(?:USD|GBP|EUR|NGN|[$£€₦])?\s*(\d[\d,.]*(?:\s?[kKmM])?)\s*(?:-|to|and)\s*(?:USD|GBP|EUR|NGN|[$£€₦])?\s*(\d[\d,.]*(?:\s?[kKmM])?)/i);
    const exact = !range ? text.match(/(?:salary|pay|compensation)\D{0,30}(?:USD|GBP|EUR|NGN|[$£€₦])?\s*(\d[\d,.]*(?:\s?[kKmM])?)/i) : null;
    if (range) {
      statedRanges.push({
        jobId: job.id,
        min: parseAmount(range[1]),
        max: parseAmount(range[2]),
        exact: null,
        currency: currencyFromText(text),
        period: periodFromText(text),
      });
    } else if (exact) {
      statedRanges.push({
        jobId: job.id,
        min: null,
        max: null,
        exact: parseAmount(exact[1]),
        currency: currencyFromText(text),
        period: periodFromText(text),
      });
    }
  }
  return {
    statedRanges,
    notes: statedRanges.length
      ? `Scanned ${jobs.length} listing(s); ${statedRanges.length} explicitly stated pay. No estimates or averages are included.`
      : `Scanned ${jobs.length} listing(s); none explicitly stated pay. No estimates or averages are included.`,
  };
}
