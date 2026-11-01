import type { StudioDraft } from './draft';

export interface ResumeContactInfo {
  location: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  github: string;
}

export interface ResumeExperienceItem {
  id: string;
  role: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  dateRange: string;
  bullets: string[];
  tools: string[];
}

export interface ResumeEducationItem {
  id: string;
  degree: string;
  field: string;
  qualificationLine: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  dateRange: string;
  achievements: string;
}

export interface ResumeProjectItem {
  id: string;
  name: string;
  role: string;
  url: string;
  description: string;
  technologies: string[];
  achievements: string[];
}

export interface ResumeCertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface ResumePublicationItem {
  id: string;
  title: string;
  venue: string;
  date: string;
  url: string;
}

export interface ResumeLanguageItem {
  language: string;
  proficiency: string;
}

export interface ResumeVolunteerItem {
  id: string;
  role: string;
  organization: string;
  dates: string;
  summary: string;
}

export interface ResumeSkillGroup {
  category: string;
  items: string[];
}

export interface NormalizedResumeDocument {
  fullName: string;
  initials: string;
  professionalTitle: string;
  contact: ResumeContactInfo;
  contactItems: Array<{ label: string; value: string }>;
  photoDataUrl: string;
  summary: string;
  experiences: ResumeExperienceItem[];
  education: ResumeEducationItem[];
  skills: string[];
  skillGroups: ResumeSkillGroup[];
  projects: ResumeProjectItem[];
  certifications: ResumeCertificationItem[];
  publications: ResumePublicationItem[];
  awards: string[];
  languages: ResumeLanguageItem[];
  volunteer: ResumeVolunteerItem[];
  memberships: string[];
  references: string;
  additional: string;
}

/** Sanitize strings so pdf-lib WinAnsi standard fonts never throw encoding errors. */
export function toPdfSafeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF\u25AA\u00B7]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanField(value: unknown, max = 1400): string {
  if (typeof value !== 'string') return '';
  return toPdfSafeText(value).slice(0, max).trim();
}

function compactUrlDisplay(raw: string): string {
  const trimmed = cleanField(raw, 240);
  if (!trimmed) return '';
  return trimmed.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
}

export function formatDateRange(start?: string | null, end?: string | null, current?: boolean): string {
  const s = cleanField(start, 48);
  const e = current ? 'Present' : cleanField(end, 48);
  if (s && e) return `${s} - ${e}`;
  return s || e || '';
}

function computeInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean);
  if (!parts.length) return 'CV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function classifySkillCategory(skill: string, providedCategory?: string): string {
  const cleanCat = cleanField(providedCategory, 60);
  if (cleanCat && !/^(core|profile|suggested|general)$/i.test(cleanCat)) {
    return cleanCat;
  }
  const s = skill.toLowerCase();
  if (/\b(python|javascript|typescript|java|go|golang|rust|c\+\+|c#|sql|r|ruby|php|swift|kotlin|bash)\b/.test(s)) {
    return 'Languages';
  }
  if (/\b(react|next\.?js|vue|angular|node\.?js|express|fastapi|django|flask|spring|graphql|rest api|tailwind)\b/.test(s)) {
    return 'Frameworks & APIs';
  }
  if (/\b(aws|gcp|google cloud|azure|docker|kubernetes|terraform|ci\/cd|git|linux|cloudflare|postgres|postgresql|redis|mongodb|snowflake)\b/.test(s)) {
    return 'Cloud, Data & DevOps';
  }
  if (/\b(ai|llm|langchain|rag|pytorch|tensorflow|scikit|nlp|automation|analytics|tableau|power bi|looker)\b/.test(s) || /machine\s+learning/i.test(s)) { // copy-guard:allow
    return 'AI, Data & Automation';
  }
  if (/\b(figma|sketch|adobe|design system|wirefram|prototyp|user research|ux|ui|typography)\b/.test(s)) {
    return 'Design & Research';
  }
  if (/\b(financial|valuation|dcf|gaap|ifrs|excel|bloomberg|fp&a|audit|budget|forecasting)\b/.test(s)) {
    return 'Finance & Analysis';
  }
  return 'Core Competencies';
}

export function buildSkillGroups(
  rawSkills: Array<{ name: string; category?: string } | string>,
): { flat: string[]; groups: ResumeSkillGroup[] } {
  const seen = new Set<string>();
  const flat: string[] = [];
  const bucketMap = new Map<string, string[]>();

  for (const entry of rawSkills) {
    const name = cleanField(typeof entry === 'string' ? entry : entry.name, 90);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    flat.push(name);
    const cat = classifySkillCategory(name, typeof entry === 'string' ? undefined : entry.category);
    const list = bucketMap.get(cat) ?? [];
    list.push(name);
    bucketMap.set(cat, list);
  }

  const groups: ResumeSkillGroup[] = Array.from(bucketMap.entries()).map(([category, items]) => ({
    category,
    items,
  }));

  return { flat, groups };
}

function parseLanguagesFromAdditional(
  explicit: Array<{ language?: string; proficiency?: string } | string> | undefined,
  additionalText: string,
): ResumeLanguageItem[] {
  const out: ResumeLanguageItem[] = [];
  const seen = new Set<string>();

  if (Array.isArray(explicit)) {
    for (const item of explicit) {
      if (typeof item === 'string') {
        const cleaned = cleanField(item, 120);
        if (!cleaned) continue;
        const [lang, ...rest] = cleaned.split(/\s*[-:|]\s*/);
        const key = lang.toLowerCase();
        if (lang && !seen.has(key)) {
          seen.add(key);
          out.push({ language: lang.trim(), proficiency: rest.join(' - ').trim() });
        }
      } else if (item && typeof item === 'object') {
        const language = cleanField(item.language, 60);
        const proficiency = cleanField(item.proficiency, 80);
        if (language && !seen.has(language.toLowerCase())) {
          seen.add(language.toLowerCase());
          out.push({ language, proficiency });
        }
      }
    }
  }

  if (!out.length && additionalText) {
    const langMatch = additionalText.match(/languages?\s*:\s*([^\n.]+)/i);
    if (langMatch?.[1]) {
      for (const part of langMatch[1].split(/[,;]/)) {
        const cleaned = cleanField(part, 100);
        if (!cleaned) continue;
        const [lang, ...rest] = cleaned.split(/\s*[-()]+\s*/).filter(Boolean);
        if (lang && !seen.has(lang.toLowerCase())) {
          seen.add(lang.toLowerCase());
          out.push({ language: lang.trim(), proficiency: rest.join(' ').trim() });
        }
      }
    }
  }

  return out;
}

function buildContactItems(contact: ResumeContactInfo): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  if (contact.location) items.push({ label: 'Location', value: contact.location });
  if (contact.email) items.push({ label: 'Email', value: contact.email });
  if (contact.phone) items.push({ label: 'Phone', value: contact.phone });
  if (contact.linkedin) items.push({ label: 'LinkedIn', value: compactUrlDisplay(contact.linkedin) });
  if (contact.github) items.push({ label: 'GitHub', value: compactUrlDisplay(contact.github) });
  if (contact.portfolio) items.push({ label: 'Portfolio', value: compactUrlDisplay(contact.portfolio) });
  return items;
}

/** Build a NormalizedResumeDocument from a live StudioDraft (preview & editor). */
export function normalizeResumeFromDraft(draft: StudioDraft): NormalizedResumeDocument {
  const fullName = cleanField(draft.personal?.name, 120);
  const professionalTitle = cleanField(draft.career?.headline || draft.career?.targetRole, 160);
  const contact: ResumeContactInfo = {
    location: cleanField(draft.personal?.location, 120),
    email: cleanField(draft.personal?.email, 120),
    phone: cleanField(draft.personal?.phone, 60),
    linkedin: cleanField(draft.personal?.linkedin, 200),
    portfolio: cleanField(draft.personal?.website, 200),
    github: cleanField(draft.personal?.github, 200),
  };

  const experiences: ResumeExperienceItem[] = (draft.experiences ?? [])
    .map((exp, idx) => {
      const bullets = (exp.bullets?.length ? exp.bullets : [exp.roughNotes, exp.impact].filter(Boolean))
        .map((b) => cleanField(b, 420))
        .filter(Boolean);
      const startDate = cleanField(exp.startDate, 48);
      const endDate = exp.current ? 'Present' : cleanField(exp.endDate, 48);
      return {
        id: cleanField(exp.id, 80) || `exp-${idx}`,
        role: cleanField(exp.role, 140),
        company: cleanField(exp.company, 140),
        location: cleanField(exp.location, 120),
        startDate,
        endDate,
        dateRange: formatDateRange(startDate, endDate, Boolean(exp.current)),
        bullets,
        tools: (exp.tools ?? []).map((t) => cleanField(t, 60)).filter(Boolean),
      };
    })
    .filter((e) => e.role || e.company || e.bullets.length > 0);

  const education: ResumeEducationItem[] = (draft.education ?? [])
    .map((edu, idx) => {
      const degree = cleanField(edu.degree, 140);
      const field = cleanField(edu.field, 140);
      const qualificationLine = [degree, field].filter(Boolean).join(', ');
      const startDate = cleanField(edu.startDate, 48);
      const endDate = cleanField(edu.endDate, 48);
      return {
        id: cleanField(edu.id, 80) || `edu-${idx}`,
        degree,
        field,
        qualificationLine,
        institution: cleanField(edu.institution, 160),
        location: '',
        startDate,
        endDate,
        dateRange: formatDateRange(startDate, endDate, false),
        achievements: cleanField(edu.achievements, 500),
      };
    })
    .filter((e) => e.qualificationLine || e.institution);

  const { flat: skills, groups: skillGroups } = buildSkillGroups(draft.skills ?? []);

  const projects: ResumeProjectItem[] = (draft.projects ?? [])
    .map((p, idx) => ({
      id: cleanField(p.id, 80) || `proj-${idx}`,
      name: cleanField(p.name, 140),
      role: '',
      url: compactUrlDisplay(p.url ?? ''),
      description: cleanField(p.description, 800),
      technologies: (p.technologies ?? []).map((t) => cleanField(t, 60)).filter(Boolean),
      achievements: (p.achievements ?? []).map((a) => cleanField(a, 320)).filter(Boolean),
    }))
    .filter((p) => p.name || p.description);

  const certifications: ResumeCertificationItem[] = (draft.certifications ?? [])
    .map((c, idx) => ({
      id: cleanField(c.id, 80) || `cert-${idx}`,
      name: cleanField(c.name, 160),
      issuer: cleanField(c.issuer, 140),
      date: cleanField(c.date, 60),
    }))
    .filter((c) => c.name);

  const additionalRaw = cleanField(draft.additional, 1600);
  const draftExt = draft as StudioDraft & {
    languages?: Array<{ language?: string; proficiency?: string } | string>;
    publications?: Array<{ id?: string; title?: string; venue?: string; date?: string; url?: string }>;
    volunteer?: Array<{ id?: string; role?: string; organization?: string; dates?: string; summary?: string }>;
    memberships?: string[];
  };

  const languages = parseLanguagesFromAdditional(draftExt.languages, additionalRaw);
  const publications: ResumePublicationItem[] = (draftExt.publications ?? [])
    .map((pub, idx) => ({
      id: cleanField(pub.id, 80) || `pub-${idx}`,
      title: cleanField(pub.title, 220),
      venue: cleanField(pub.venue, 160),
      date: cleanField(pub.date, 60),
      url: compactUrlDisplay(pub.url ?? ''),
    }))
    .filter((pub) => pub.title);

  const volunteer: ResumeVolunteerItem[] = (draftExt.volunteer ?? [])
    .map((v, idx) => ({
      id: cleanField(v.id, 80) || `vol-${idx}`,
      role: cleanField(v.role, 140),
      organization: cleanField(v.organization, 140),
      dates: cleanField(v.dates, 80),
      summary: cleanField(v.summary, 400),
    }))
    .filter((v) => v.role || v.organization);

  const memberships = (draftExt.memberships ?? []).map((m) => cleanField(m, 140)).filter(Boolean);
  const awards = (draft.achievements ?? []).map((a) => cleanField(a, 260)).filter(Boolean);
  const cleanedAdditional = languages.length
    ? additionalRaw.replace(/^languages?\s*:\s*[^\n.]+[.\s]*/i, '').trim()
    : additionalRaw;

  return {
    fullName,
    initials: computeInitials(fullName),
    professionalTitle,
    contact,
    contactItems: buildContactItems(contact),
    photoDataUrl: typeof draft.personal?.photoDataUrl === 'string' ? draft.personal.photoDataUrl : '',
    summary: cleanField(draft.career?.summary, 1400),
    experiences,
    education,
    skills,
    skillGroups,
    projects,
    certifications,
    publications,
    awards,
    languages,
    volunteer,
    memberships,
    references: cleanField(draft.references, 600),
    additional: cleanedAdditional,
  };
}

export interface StoredCvPayload {
  templateId?: string;
  templateName?: string;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
    linkedin?: string;
    github?: string;
  };
  headline?: string;
  summary?: string;
  experiences?: Array<{
    company?: string;
    title?: string;
    location?: string;
    start?: string | null;
    end?: string | null;
    bullets?: string[];
    tools?: string[];
  }>;
  skills?: Array<string | { name: string; category?: string }>;
  education?: Array<{
    institution?: string;
    qualification?: string;
    degree?: string;
    field?: string;
    location?: string;
    start?: string | null;
    end?: string | null;
    achievements?: string;
  }>;
  projects?: Array<{
    name?: string;
    role?: string;
    description?: string;
    technologies?: string[];
    url?: string;
    achievements?: string[];
  }>;
  certifications?: Array<{ name?: string; issuer?: string; date?: string }>;
  publications?: Array<{ title?: string; venue?: string; date?: string; url?: string }>;
  languages?: Array<{ language?: string; proficiency?: string } | string>;
  volunteer?: Array<{ role?: string; organization?: string; dates?: string; summary?: string }>;
  memberships?: string[];
  achievements?: string[];
  additional?: string;
  references?: string;
  photoDataUrl?: string;
}

/** Build a NormalizedResumeDocument from stored generated_documents JSON. */
export function normalizeResumeFromStoredJson(json: StoredCvPayload): NormalizedResumeDocument {
  const fullName = cleanField(json.contact?.name, 120);
  const professionalTitle = cleanField(json.headline, 160);
  const contact: ResumeContactInfo = {
    location: cleanField(json.contact?.location, 120),
    email: cleanField(json.contact?.email, 120),
    phone: cleanField(json.contact?.phone, 60),
    linkedin: cleanField(json.contact?.linkedin, 200),
    portfolio: cleanField(json.contact?.website, 200),
    github: cleanField(json.contact?.github, 200),
  };

  const experiences: ResumeExperienceItem[] = (json.experiences ?? [])
    .map((exp, idx) => {
      const startDate = cleanField(exp.start ?? '', 48);
      const endDate = cleanField(exp.end ?? '', 48);
      return {
        id: `exp-${idx}`,
        role: cleanField(exp.title, 140),
        company: cleanField(exp.company, 140),
        location: cleanField(exp.location, 120),
        startDate,
        endDate,
        dateRange: formatDateRange(startDate, endDate, false),
        bullets: (exp.bullets ?? []).map((b) => cleanField(b, 420)).filter(Boolean),
        tools: (exp.tools ?? []).map((t) => cleanField(t, 60)).filter(Boolean),
      };
    })
    .filter((e) => e.role || e.company || e.bullets.length > 0);

  const education: ResumeEducationItem[] = (json.education ?? [])
    .map((edu, idx) => {
      const degree = cleanField(edu.degree, 140);
      const field = cleanField(edu.field, 140);
      const qual = cleanField(edu.qualification, 180) || [degree, field].filter(Boolean).join(', ');
      const startDate = cleanField(edu.start ?? '', 48);
      const endDate = cleanField(edu.end ?? '', 48);
      return {
        id: `edu-${idx}`,
        degree: degree || qual,
        field,
        qualificationLine: qual,
        institution: cleanField(edu.institution, 160),
        location: cleanField(edu.location, 120),
        startDate,
        endDate,
        dateRange: formatDateRange(startDate, endDate, false),
        achievements: cleanField(edu.achievements, 500),
      };
    })
    .filter((e) => e.qualificationLine || e.institution);

  const { flat: skills, groups: skillGroups } = buildSkillGroups(json.skills ?? []);

  const projects: ResumeProjectItem[] = (json.projects ?? [])
    .map((p, idx) => ({
      id: `proj-${idx}`,
      name: cleanField(p.name, 140),
      role: cleanField(p.role, 120),
      url: compactUrlDisplay(p.url ?? ''),
      description: cleanField(p.description, 800),
      technologies: (p.technologies ?? []).map((t) => cleanField(t, 60)).filter(Boolean),
      achievements: (p.achievements ?? []).map((a) => cleanField(a, 320)).filter(Boolean),
    }))
    .filter((p) => p.name || p.description);

  const certifications: ResumeCertificationItem[] = (json.certifications ?? [])
    .map((c, idx) => ({
      id: `cert-${idx}`,
      name: cleanField(c.name, 160),
      issuer: cleanField(c.issuer, 140),
      date: cleanField(c.date, 60),
    }))
    .filter((c) => c.name);

  const additionalRaw = cleanField(json.additional, 1600);
  const languages = parseLanguagesFromAdditional(json.languages, additionalRaw);
  const publications: ResumePublicationItem[] = (json.publications ?? [])
    .map((pub, idx) => ({
      id: `pub-${idx}`,
      title: cleanField(pub.title, 220),
      venue: cleanField(pub.venue, 160),
      date: cleanField(pub.date, 60),
      url: compactUrlDisplay(pub.url ?? ''),
    }))
    .filter((p) => p.title);

  const volunteer: ResumeVolunteerItem[] = (json.volunteer ?? [])
    .map((v, idx) => ({
      id: `vol-${idx}`,
      role: cleanField(v.role, 140),
      organization: cleanField(v.organization, 140),
      dates: cleanField(v.dates, 80),
      summary: cleanField(v.summary, 400),
    }))
    .filter((v) => v.role || v.organization);

  const memberships = (json.memberships ?? []).map((m) => cleanField(m, 140)).filter(Boolean);
  const awards = (json.achievements ?? []).map((a) => cleanField(a, 260)).filter(Boolean);
  const cleanedAdditional = languages.length
    ? additionalRaw.replace(/^languages?\s*:\s*[^\n.]+[.\s]*/i, '').trim()
    : additionalRaw;

  return {
    fullName,
    initials: computeInitials(fullName),
    professionalTitle,
    contact,
    contactItems: buildContactItems(contact),
    photoDataUrl: typeof json.photoDataUrl === 'string' ? json.photoDataUrl : '',
    summary: cleanField(json.summary, 1400),
    experiences,
    education,
    skills,
    skillGroups,
    projects,
    certifications,
    publications,
    awards,
    languages,
    volunteer,
    memberships,
    references: cleanField(json.references, 600),
    additional: cleanedAdditional,
  };
}
