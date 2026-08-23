import type { TruthfulnessReport } from '@/lib/truthfulness/types';

/** Profile subset used by the generators (built from career_profiles + profiles). */
export interface GenerationProfile {
  headline?: string | null;
  summary?: string | null;
  skills: string[];
  targetRoles: string[];
  experience: { company?: string; title?: string; description?: string }[];
  education: { institution?: string; qualification?: string }[];
}

/** Minimal job context passed to the generators (the job description is untrusted). */
export interface GenerationJob {
  company: string;
  title: string;
  description: string;
  location?: string;
}

export type GenerationKind = 'CV' | 'COVER_LETTER' | 'ANSWERS';

/* ---------- CV ---------- */
export interface CVExperience {
  company: string;
  title: string;
  start: string | null;
  end: string | null;
  bullets: string[];
}
export interface CVOutput {
  headline: string;
  summary: string;
  experiences: CVExperience[];
  skills: string[];
  education: { institution: string; qualification: string }[];
}

/* ---------- Cover letter ---------- */
export interface ReferenceSet {
  employers: string[];
  schools: string[];
  skills: string[];
}
export interface CoverLetterOutput {
  body: string;
  references: ReferenceSet;
}

/* ---------- Application answers ---------- */
export interface AnswersOutput {
  answers: { question: string; answer: string }[];
  references: ReferenceSet;
}

/** Normalized result returned by the generation service to the route. */
export interface GenerationResult {
  kind: GenerationKind;
  title: string;
  /** Serialized content stored verbatim (hashed for immutability). */
  content: string;
  report: TruthfulnessReport;
  /** Provider that produced the output (for traceability in source_facts). */
  provider: string;
}
