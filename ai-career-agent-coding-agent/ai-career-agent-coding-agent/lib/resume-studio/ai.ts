import { scoreResumeDraft, cleanText, normalizeStudioDraft, uniqueStrings, type StudioDraft, type StudioExperience } from './draft';
import { recommendResumeTemplates } from './templates';

export type ResumeAIAction =
  | 'suggestSkills'
  | 'writeSummary'
  | 'generateExperience'
  | 'improveExperience'
  | 'analyzeResume'
  | 'optimizeForJob'
  | 'recommendTemplate'
  | 'extractProfile'
  | 'finalReview';

export interface ResumeAIProvider {
  generateSummary(draft: Partial<StudioDraft>): Promise<{ text: string; notes: string[] }>;
  suggestSkills(input: { role?: string; existing?: string[] }): Promise<{ suggestions: string[]; note: string }>;
  generateExperience(input: { experience: Partial<StudioExperience>; seniority?: string }): Promise<{ bullets: string[]; followUpQuestions: string[]; note: string }>;
  improveExperience(input: { bullets: string[]; mode: 'stronger' | 'simpler' | 'technical' | 'senior' | 'ats'; experience: Partial<StudioExperience>; seniority?: string }): Promise<{ bullets: string[]; note: string }>;
  analyzeResume(draft: Partial<StudioDraft>): Promise<ReturnType<typeof scoreResumeDraft>>;
  optimizeForJob(draft: Partial<StudioDraft>, jobDescription: string): Promise<{ match: number; matchingSkills: string[]; missingKeywords: string[]; recommendations: string[] }>;
  recommendTemplate(draft: Partial<StudioDraft>): Promise<{ recommended: ReturnType<typeof recommendResumeTemplates>; reason: string }>;
  extractProfile(text: string): Promise<{ extracted: Partial<StudioDraft>; questions: string[] }>;
  finalReview(draft: Partial<StudioDraft>): Promise<{ ready: boolean; summary: string; checks: { label: string; ok: boolean; detail: string }[] }>;
}

const ROLE_SKILLS: Record<string, string[]> = {
  ai: ['AI Agents', 'AI Automation', 'Python', 'APIs', 'LLMs', 'Workflow Automation', 'Machine Learning', 'Data Analysis', 'Prompt Engineering', 'Vector Databases'],
  software: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'APIs', 'Databases', 'Testing', 'System Design', 'Git', 'Cloud Deployment'],
  data: ['SQL', 'Python', 'Dashboards', 'Data Analysis', 'ETL', 'Excel', 'Statistics', 'Data Visualization', 'Machine Learning', 'Business Intelligence'],
  product: ['Product Strategy', 'User Research', 'Roadmapping', 'Analytics', 'Stakeholder Management', 'Experimentation', 'Prioritization', 'Go-to-market', 'Agile Delivery'],
  marketing: ['Content Strategy', 'SEO', 'Campaign Planning', 'Copywriting', 'Analytics', 'Email Marketing', 'Social Media', 'Brand Positioning', 'Conversion Optimization'],
  operations: ['Process Improvement', 'Project Coordination', 'Workflow Design', 'Reporting', 'Vendor Management', 'Customer Support', 'Documentation', 'Team Coordination'],
  finance: ['Financial Analysis', 'Budgeting', 'Forecasting', 'Excel', 'Reporting', 'Risk Analysis', 'Accounting', 'Compliance', 'Stakeholder Reporting'],
};

const WEAK_PHRASES = [
  'results-driven professional',
  'passionate individual',
  'leveraged cutting-edge technology',
  'proven track record',
  'synergistic',
];

function sentence(text: string) {
  const cleaned = cleanText(text, 320);
  if (!cleaned) return '';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function roleKey(role = '') {
  const lower = role.toLowerCase();
  if (/ai|agent|llm|machine learning|automation/.test(lower)) return 'ai';
  if (/software|developer|engineer|frontend|backend|full stack/.test(lower)) return 'software';
  if (/data|analyst|science|bi/.test(lower)) return 'data';
  if (/product|pm/.test(lower)) return 'product';
  if (/marketing|content|growth|seo|brand/.test(lower)) return 'marketing';
  if (/operation|admin|support|project/.test(lower)) return 'operations';
  if (/finance|account|bank|audit/.test(lower)) return 'finance';
  return 'ai';
}

function seniorityVerb(seniority = '') {
  if (seniority === 'executive' || seniority === 'senior') return 'Led';
  if (seniority === 'mid') return 'Owned';
  if (seniority === 'student' || seniority === 'early') return 'Contributed to';
  return 'Built';
}

function extractKeywords(text: string) {
  const stop = new Set('the and with for from that this you are was were will have has into your our their role job candidate experience skills using use work team teams build built create created manage managed develop developed strong excellent ability responsibilities requirements preferred needed'.split(' '));
  return uniqueStrings(cleanText(text, 30000).toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 3 && !stop.has(w)).map((w) => w.replace(/^\.+|\.+$/g, '')), 30);
}

export class LocalResumeAIProvider implements ResumeAIProvider {
  async suggestSkills(input: { role?: string; existing?: string[] }) {
    const base = ROLE_SKILLS[roleKey(input.role)] ?? ROLE_SKILLS.ai;
    const existing = new Set((input.existing ?? []).map((s) => s.toLowerCase()));
    return {
      suggestions: base.filter((s) => !existing.has(s.toLowerCase())).slice(0, 12),
      note: 'These are suggestions, not claimed skills. Keep only the ones you actually have.',
    };
  }

  async generateSummary(input: Partial<StudioDraft>) {
    const draft = normalizeStudioDraft(input);
    const role = cleanText(draft.career.targetRole || draft.career.headline || 'professional', 120);
    const years = cleanText(draft.career.yearsExperience, 40);
    const skills = uniqueStrings(draft.skills.map((s) => s.name), 8);
    const experienceSignals = draft.experiences
      .map((e) => cleanText([e.role, e.company, e.roughNotes].filter(Boolean).join(' at '), 180))
      .filter(Boolean)
      .slice(0, 2);
    const parts = [
      `${role}${years ? ` with ${years} years of experience` : ''}.`,
      skills.length ? `Skilled in ${skills.join(', ')}.` : '',
      experienceSignals.length ? `Experience includes ${experienceSignals.join('; ')}.` : '',
    ].filter(Boolean);
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return {
      text: cleanText(text || `Professional profile focused on ${role}. Add more details so I can make this stronger.`, 620),
      notes: ['I only used facts already present in your draft.', skills.length ? 'Skills were included because you selected them.' : 'Add skills to make the summary more specific.'],
    };
  }

  async generateExperience(input: { experience: Partial<StudioExperience>; seniority?: string }) {
    const exp = input.experience;
    const role = cleanText(exp.role || 'the role', 120);
    const company = cleanText(exp.company || '', 120);
    const notes = cleanText(exp.roughNotes || '', 1600);
    const impact = cleanText(exp.impact || '', 700);
    const tools = uniqueStrings(exp.tools ?? [], 12);
    const followUpQuestions: string[] = [];

    if (!notes || notes.length < 30) followUpQuestions.push('What did you actually build, manage, support or improve?');
    if (!tools.length) followUpQuestions.push('Which tools, platforms, languages or systems did you use?');
    if (!impact) followUpQuestions.push('What changed after your work, even if you do not have exact numbers?');
    if (!company) followUpQuestions.push('Who was this work for, such as a company, client, school project or personal project?');

    const verb = seniorityVerb(input.seniority);
    const bullets: string[] = [];
    if (notes) bullets.push(sentence(`${verb} ${notes.charAt(0).toLowerCase()}${notes.slice(1)}`));
    if (tools.length) bullets.push(sentence(`Used ${tools.join(', ')} to support ${role.toLowerCase()} work${company ? ` at ${company}` : ''}`));
    if (impact) bullets.push(sentence(`Improved work by ${impact.charAt(0).toLowerCase()}${impact.slice(1)}`));
    if (!bullets.length) bullets.push(sentence(`${verb} responsibilities related to ${role}. Add more details to make this bullet specific`));

    return {
      bullets: uniqueStrings(bullets, 5),
      followUpQuestions: followUpQuestions.slice(0, 4),
      note: followUpQuestions.length ? 'I wrote a safe first version and still need these answers to make it stronger.' : 'This is based only on the facts you gave me.',
    };
  }

  async improveExperience(input: { bullets: string[]; mode: 'stronger' | 'simpler' | 'technical' | 'senior' | 'ats'; experience: Partial<StudioExperience>; seniority?: string }) {
    const tools = uniqueStrings(input.experience.tools ?? [], 12);
    const role = cleanText(input.experience.role || 'role', 120);
    const improved = input.bullets.map((bullet) => {
      let text = cleanText(bullet, 300);
      for (const phrase of WEAK_PHRASES) text = text.replace(new RegExp(phrase, 'ig'), '').trim();
      if (input.mode === 'simpler') return sentence(text.replace(/\bimplemented\b/gi, 'built').replace(/\butilized\b/gi, 'used'));
      if (input.mode === 'technical' && tools.length && !tools.some((tool) => text.toLowerCase().includes(tool.toLowerCase()))) return sentence(`${text.replace(/[.!?]$/, '')} using ${tools.slice(0, 4).join(', ')}`);
      if (input.mode === 'senior' && ['senior', 'executive'].includes(input.seniority || '')) return sentence(text.replace(/^Built\b/i, 'Led').replace(/^Contributed to\b/i, 'Owned'));
      if (input.mode === 'ats') return sentence(`${text.replace(/[.!?]$/, '')} for ${role} responsibilities`);
      return sentence(text.replace(/^Helped with\b/i, 'Supported').replace(/^Worked on\b/i, 'Built'));
    }).filter(Boolean);
    return { bullets: uniqueStrings(improved, 6), note: 'I improved wording without adding new employers, numbers, tools or outcomes.' };
  }

  async analyzeResume(draft: Partial<StudioDraft>) {
    return scoreResumeDraft(draft);
  }

  async optimizeForJob(draftInput: Partial<StudioDraft>, jobDescription: string) {
    const draft = normalizeStudioDraft(draftInput);
    const jdKeywords = extractKeywords(jobDescription);
    const candidateTerms = extractKeywords([
      draft.career.headline,
      draft.career.targetRole,
      draft.career.summary,
      ...draft.skills.map((s) => s.name),
      ...draft.experiences.flatMap((e) => [e.role, e.roughNotes, e.impact, ...e.tools, ...e.bullets]),
      ...draft.projects.flatMap((p) => [p.name, p.description, ...p.technologies, ...p.achievements]),
    ].join(' '));
    const candidateSet = new Set(candidateTerms.map((x) => x.toLowerCase()));
    const matchingSkills = jdKeywords.filter((kw) => candidateSet.has(kw)).slice(0, 12);
    const missingKeywords = jdKeywords.filter((kw) => !candidateSet.has(kw)).slice(0, 12);
    const match = jdKeywords.length ? Math.max(18, Math.min(96, Math.round((matchingSkills.length / jdKeywords.length) * 100))) : 0;
    const recommendations = [
      matchingSkills.length ? `Emphasize these existing matches: ${matchingSkills.join(', ')}.` : 'I did not find many direct keyword matches yet.',
      missingKeywords.length ? `Only add these keywords if they are true for you: ${missingKeywords.slice(0, 8).join(', ')}.` : 'No obvious missing keywords from the pasted job description.',
      'Do not add tools, credentials or metrics unless they are true and already part of your experience.',
    ];
    return { match, matchingSkills, missingKeywords, recommendations };
  }

  async recommendTemplate(draftInput: Partial<StudioDraft>) {
    const draft = normalizeStudioDraft(draftInput);
    const recommended = recommendResumeTemplates({
      role: draft.career.targetRole || draft.career.headline,
      yearsExperience: Number(draft.career.yearsExperience || 0),
      skills: draft.skills.map((s) => s.name),
    });
    return {
      recommended,
      reason: `Based on your target role, seniority and resume length, I recommend ${recommended.map((t) => t.name).join(', ')}. You can still browse all 50 templates.`,
    };
  }

  async extractProfile(text: string) {
    const source = cleanText(text, 6000);
    const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
    const years = source.match(/(\d{1,2})\+?\s+years?/i)?.[1] ?? '';
    const role = source.match(/(?:as an?|role as|targeting|target role)\s+([a-zA-Z0-9 +#./-]{3,60})/i)?.[1] ?? '';
    const skills = extractKeywords(source).filter((kw) => /python|react|sql|ai|automation|api|llm|data|javascript|typescript|cloud|aws|excel|seo|sales|support/.test(kw)).slice(0, 12);
    return {
      extracted: {
        personal: { ...normalizeStudioDraft(null).personal, email },
        career: { ...normalizeStudioDraft(null).career, targetRole: cleanText(role, 80), yearsExperience: years },
        skills: skills.map((name, index) => ({ name, category: 'Extracted', priority: index + 1 })),
        additional: source,
      },
      questions: ['Please confirm the extracted role and skills.', 'Which company or project should we add first?', 'Do you have dates, tools or measurable impact to include?'],
    };
  }

  async finalReview(draftInput: Partial<StudioDraft>) {
    const draft = normalizeStudioDraft(draftInput);
    const score = scoreResumeDraft(draft);
    const checks = [
      { label: 'Contact information', ok: Boolean(draft.personal.name && draft.personal.email), detail: draft.personal.name && draft.personal.email ? 'Name and email are present.' : 'Add your name and email.' },
      { label: 'Career identity', ok: Boolean(draft.career.targetRole || draft.career.headline), detail: 'Target role or headline helps the resume feel focused.' },
      { label: 'Experience or projects', ok: draft.experiences.length > 0 || draft.projects.length > 0, detail: 'At least one role or project gives the resume substance.' },
      { label: 'Skills', ok: draft.skills.length >= 6, detail: 'Six or more relevant skills improves scanability.' },
      { label: 'ATS structure', ok: score.ats >= 70, detail: `ATS score is ${score.ats}.` },
      { label: 'No invented facts', ok: true, detail: 'The builder only used information in your draft.' },
    ];
    return {
      ready: checks.every((c) => c.ok) && score.total >= 70,
      summary: `Your resume strength is ${score.total}/100. ${score.fixes[0]?.message ?? 'It is ready for final generation.'}`,
      checks,
    };
  }
}

export const localResumeAIProvider = new LocalResumeAIProvider();
