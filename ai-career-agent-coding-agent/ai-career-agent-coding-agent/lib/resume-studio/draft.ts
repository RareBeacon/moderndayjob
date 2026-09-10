import type { GenerationProfile } from '@/lib/generation/types';

export interface StudioExperience {
  id: string;
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  roughNotes: string;
  tools: string[];
  impact: string;
  bullets: string[];
}

export interface StudioEducation {
  id: string;
  institution: string;
  degree: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  achievements?: string;
}

export interface StudioProject {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  url?: string;
  achievements: string[];
}

export interface StudioCertification {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
}

export interface StudioDraft {
  id?: string;
  versionName: string;
  selectedTemplate: string;
  currentStep: string;
  personal: {
    name: string;
    email: string;
    phone: string;
    location: string;
    website: string;
    linkedin: string;
    github: string;
  };
  career: {
    headline: string;
    targetRole: string;
    yearsExperience: string;
    seniority: 'student' | 'early' | 'mid' | 'senior' | 'executive' | '';
    summary: string;
  };
  skills: { name: string; category: string; priority: number }[];
  experiences: StudioExperience[];
  education: StudioEducation[];
  projects: StudioProject[];
  certifications: StudioCertification[];
  achievements: string[];
  references: string;
  additional: string;
  targetJobDescription: string;
}

export interface ResumeScore {
  total: number;
  content: number;
  experience: number;
  skills: number;
  ats: number;
  formatting: number;
  explanations: string[];
  fixes: { step: string; message: string }[];
}

export const EMPTY_STUDIO_DRAFT: StudioDraft = {
  versionName: 'General Resume',
  selectedTemplate: 'modern-tech',
  currentStep: 'welcome',
  personal: { name: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '' },
  career: { headline: '', targetRole: '', yearsExperience: '', seniority: '', summary: '' },
  skills: [],
  experiences: [],
  education: [],
  projects: [],
  certifications: [],
  achievements: [],
  references: '',
  additional: '',
  targetJobDescription: '',
};

export function stripResumeUnsafePunctuation(text: string) {
  return text.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
}

export function cleanText(value: unknown, max = 1200) {
  if (typeof value !== 'string') return '';
  return stripResumeUnsafePunctuation(value).slice(0, max).trim();
}

export function uniqueStrings(values: string[], max = 50) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = cleanText(value, 120);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeStudioDraft(input: Partial<StudioDraft> | null | undefined): StudioDraft {
  const d = input ?? {};
  return {
    ...EMPTY_STUDIO_DRAFT,
    ...d,
    versionName: cleanText(d.versionName, 120) || EMPTY_STUDIO_DRAFT.versionName,
    selectedTemplate: cleanText(d.selectedTemplate, 80) || EMPTY_STUDIO_DRAFT.selectedTemplate,
    currentStep: cleanText(d.currentStep, 80) || EMPTY_STUDIO_DRAFT.currentStep,
    personal: { ...EMPTY_STUDIO_DRAFT.personal, ...(d.personal ?? {}) },
    career: { ...EMPTY_STUDIO_DRAFT.career, ...(d.career ?? {}) },
    skills: Array.isArray(d.skills) ? d.skills.map((s, index) => ({ name: cleanText(s.name, 80), category: cleanText(s.category, 80) || 'Core', priority: Number(s.priority ?? index + 1) || index + 1 })).filter((s) => s.name).slice(0, 80) : [],
    experiences: Array.isArray(d.experiences) ? d.experiences.map((e, index) => ({
      id: cleanText(e.id, 80) || `exp-${index}`,
      company: cleanText(e.company, 120),
      role: cleanText(e.role, 120),
      location: cleanText(e.location, 120),
      startDate: cleanText(e.startDate, 40),
      endDate: cleanText(e.endDate, 40),
      current: Boolean(e.current),
      roughNotes: cleanText(e.roughNotes, 2000),
      tools: uniqueStrings(e.tools ?? [], 30),
      impact: cleanText(e.impact, 1000),
      bullets: uniqueStrings(e.bullets ?? [], 8),
    })).filter((e) => e.company || e.role || e.roughNotes || e.bullets.length).slice(0, 20) : [],
    education: Array.isArray(d.education) ? d.education.map((e, index) => ({
      id: cleanText(e.id, 80) || `edu-${index}`,
      institution: cleanText(e.institution, 160),
      degree: cleanText(e.degree, 160),
      field: cleanText(e.field, 160),
      startDate: cleanText(e.startDate, 40),
      endDate: cleanText(e.endDate, 40),
      achievements: cleanText(e.achievements, 800),
    })).filter((e) => e.institution || e.degree || e.field).slice(0, 12) : [],
    projects: Array.isArray(d.projects) ? d.projects.map((p, index) => ({
      id: cleanText(p.id, 80) || `project-${index}`,
      name: cleanText(p.name, 140),
      description: cleanText(p.description, 1200),
      technologies: uniqueStrings(p.technologies ?? [], 30),
      url: cleanText(p.url, 240),
      achievements: uniqueStrings(p.achievements ?? [], 8),
    })).filter((p) => p.name || p.description).slice(0, 15) : [],
    certifications: Array.isArray(d.certifications) ? d.certifications.map((c, index) => ({
      id: cleanText(c.id, 80) || `cert-${index}`,
      name: cleanText(c.name, 160),
      issuer: cleanText(c.issuer, 160),
      date: cleanText(c.date, 80),
    })).filter((c) => c.name).slice(0, 20) : [],
    achievements: uniqueStrings(d.achievements ?? [], 20),
    references: cleanText(d.references, 1000),
    additional: cleanText(d.additional, 1600),
    targetJobDescription: cleanText(d.targetJobDescription, 30000),
  };
}

export function draftToGenerationProfile(draftInput: Partial<StudioDraft>): GenerationProfile {
  const draft = normalizeStudioDraft(draftInput);
  return {
    headline: draft.career.headline || draft.career.targetRole || null,
    summary: draft.career.summary || null,
    targetRoles: uniqueStrings([draft.career.targetRole, draft.career.headline].filter(Boolean) as string[], 6),
    skills: uniqueStrings(draft.skills.map((s) => s.name).concat(draft.experiences.flatMap((e) => e.tools), draft.projects.flatMap((p) => p.technologies)), 60),
    experience: draft.experiences.map((e) => ({
      company: e.company,
      title: e.role,
      description: [e.roughNotes, e.impact, ...e.bullets].filter(Boolean).join('. '),
    })),
    education: draft.education.map((e) => ({
      institution: e.institution,
      qualification: [e.degree, e.field].filter(Boolean).join(', '),
    })),
  };
}

export function scoreResumeDraft(draftInput: Partial<StudioDraft>): ResumeScore {
  const draft = normalizeStudioDraft(draftInput);
  const fixes: ResumeScore['fixes'] = [];
  const explanations: string[] = [];

  const contactItems = [draft.personal.name, draft.personal.email, draft.personal.phone, draft.personal.location].filter(Boolean).length;
  const hasHeadline = Boolean(draft.career.headline || draft.career.targetRole);
  const hasSummary = draft.career.summary.length >= 80;
  const experienceCount = draft.experiences.length;
  const strongExperienceCount = draft.experiences.filter((e) => e.bullets.length >= 2 || e.roughNotes.length >= 80).length;
  const skillCount = draft.skills.length;
  const hasEducation = draft.education.length > 0;
  const hasTargetJob = draft.targetJobDescription.length >= 80;
  const hasBadHeadings = false;

  const content = Math.min(100, Math.round((contactItems / 4) * 25 + (hasHeadline ? 20 : 0) + (hasSummary ? 25 : 0) + (hasEducation ? 10 : 0) + (draft.projects.length ? 10 : 0) + (draft.certifications.length ? 10 : 0)));
  const experience = Math.min(100, Math.round((experienceCount ? 35 : 0) + Math.min(45, strongExperienceCount * 18) + (draft.achievements.length ? 10 : 0) + (draft.experiences.some((e) => /\d/.test(e.impact + ' ' + e.roughNotes + ' ' + e.bullets.join(' '))) ? 10 : 0)));
  const skills = Math.min(100, Math.round(Math.min(60, skillCount * 6) + (skillCount >= 8 ? 20 : 0) + (draft.skills.some((s) => s.category && s.category !== 'Core') ? 20 : 0)));
  const ats = Math.min(100, Math.round((hasHeadline ? 18 : 0) + (skillCount >= 6 ? 22 : 0) + (experienceCount ? 22 : 0) + (hasEducation ? 12 : 0) + (hasTargetJob ? 16 : 0) + (hasBadHeadings ? 0 : 10)));
  const formatting = Math.min(100, Math.round(65 + (draft.selectedTemplate ? 20 : 0) + (draft.experiences.length <= 8 ? 10 : 5) + (draft.career.summary.length <= 520 ? 5 : 0)));
  const total = Math.round(content * 0.24 + experience * 0.28 + skills * 0.18 + ats * 0.2 + formatting * 0.1);

  if (contactItems < 3) fixes.push({ step: 'about', message: 'Add name, email, phone and location so employers can contact you.' });
  if (!hasHeadline) fixes.push({ step: 'career', message: 'Add a clear target role or professional headline.' });
  if (!hasSummary) fixes.push({ step: 'polish', message: 'Generate or write a concise professional summary.' });
  if (!experienceCount) fixes.push({ step: 'experience', message: 'Add at least one role, internship, project or freelance engagement.' });
  if (experienceCount && strongExperienceCount < experienceCount) fixes.push({ step: 'experience', message: 'Strengthen experience bullets with clearer scope, tools or outcomes.' });
  if (skillCount < 6) fixes.push({ step: 'skills', message: 'Add at least six relevant skills for ATS matching.' });
  if (!hasTargetJob) fixes.push({ step: 'optimize', message: 'Paste a target job description when you want a stronger match score.' });

  explanations.push(`Content score is ${content} because contact, headline, summary and optional sections are checked separately.`);
  explanations.push(`Experience score is ${experience} based on role count, useful detail and measurable outcomes only when supplied.`);
  explanations.push(`ATS score is ${ats} based on standard sections, skills and target job alignment.`);

  return { total, content, experience, skills, ats, formatting, explanations, fixes };
}

export function completionForDraft(draftInput: Partial<StudioDraft>) {
  const draft = normalizeStudioDraft(draftInput);
  const checks = [
    Boolean(draft.personal.name),
    Boolean(draft.personal.email),
    Boolean(draft.career.targetRole || draft.career.headline),
    draft.skills.length >= 3,
    draft.experiences.length > 0 || draft.projects.length > 0 || draft.education.length > 0,
    Boolean(draft.career.summary),
    Boolean(draft.selectedTemplate),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
