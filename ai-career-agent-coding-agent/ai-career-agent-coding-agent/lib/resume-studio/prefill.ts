import { EMPTY_STUDIO_DRAFT, normalizeStudioDraft, type StudioDraft } from './draft';

/**
 * Resume Studio profile-aware pass (Milestone 5).
 *
 * The studio loads the user's career profile (their "memory") and prefills
 * the draft from it, so the wizard only asks for what is actually missing:
 * a user with a complete profile lands on the first incomplete section,
 * not on "what is your name?". Extracted from the page in M5 so the
 * prefill-and-skip behavior is unit-testable.
 */

export interface ProfileMemory {
  fullName?: string | null;
  email?: string | null;
  targetRoles?: string[] | null;
  career?: {
    headline?: string | null;
    summary?: string | null;
    skills?: string[] | null;
    experience?: Array<{ company?: string | null; title?: string | null; description?: string | null }> | null;
    education?: Array<{ institution?: string | null; qualification?: string | null }> | null;
    projects?: Array<{ name?: string | null; description?: string | null; technologies?: string[] | null; url?: string | null }> | null;
    links?: { website?: string | null; linkedin?: string | null; github?: string | null } | null;
  } | null;
}

function newId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** A brand-new empty draft. */
export function freshDraft(): StudioDraft {
  return normalizeStudioDraft(JSON.parse(JSON.stringify(EMPTY_STUDIO_DRAFT)) as StudioDraft);
}

/** Prefill a draft from the user's profile memory. Only real profile data
 *  is copied; nothing is invented (the AI Experience Builder and the
 *  truthfulness gate keep it that way downstream). */
export function draftFromMemory(memory?: ProfileMemory | null): StudioDraft {
  const draft = freshDraft();
  if (!memory) return draft;
  draft.personal.name = memory.fullName ?? '';
  draft.personal.email = memory.email ?? '';
  draft.career.targetRole = memory.targetRoles?.[0] ?? '';
  draft.career.headline = memory.career?.headline ?? draft.career.targetRole;
  draft.career.summary = memory.career?.summary ?? '';
  draft.personal.website = memory.career?.links?.website ?? '';
  draft.personal.linkedin = memory.career?.links?.linkedin ?? '';
  draft.personal.github = memory.career?.links?.github ?? '';
  draft.skills = (memory.career?.skills ?? []).map((name, index) => ({ name, category: 'Profile', priority: index + 1 }));
  draft.experiences = (memory.career?.experience ?? []).map((e, index) => ({
    id: newId(`exp-${index}`),
    company: e.company ?? '',
    role: e.title ?? '',
    roughNotes: e.description ?? '',
    tools: [],
    impact: '',
    bullets: e.description ? [e.description] : [],
  }));
  draft.education = (memory.career?.education ?? []).map((e, index) => ({
    id: newId(`edu-${index}`),
    institution: e.institution ?? '',
    degree: e.qualification ?? '',
  }));
  draft.projects = (memory.career?.projects ?? []).map((p, index) => ({
    id: newId(`project-${index}`),
    name: p.name ?? '',
    description: p.description ?? '',
    technologies: p.technologies ?? [],
    url: p.url ?? '',
    achievements: [],
  }));
  return normalizeStudioDraft(draft);
}

export type StudioStepId = 'welcome' | 'about' | 'career' | 'experience' | 'skills' | 'education' | 'optimize' | 'templates' | 'review';

/** The first wizard step that still needs the user's input, given the
 *  prefilled draft. Sections the profile already filled are skipped; the
 *  wizard starts where the user's work actually is. 'optimize' and beyond
 *  are polish/choice steps everyone sees, so a complete profile lands on
 *  'optimize' (the role-specific tailoring step), never on 'welcome'. */
export function firstIncompleteStep(draft: StudioDraft): StudioStepId {
  const aboutDone = Boolean(draft.personal.name && draft.personal.email);
  if (!aboutDone) return 'about';
  if (!draft.career.headline && !draft.career.summary) return 'career';
  if (!draft.experiences.length) return 'experience';
  if (!draft.skills.length) return 'skills';
  if (!draft.education.length && !draft.projects.length) return 'education';
  return 'optimize';
}
