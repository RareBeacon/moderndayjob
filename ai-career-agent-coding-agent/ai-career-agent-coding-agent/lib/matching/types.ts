import type { RemoteType, EmploymentType } from '@/lib/jobs/types';

/** Profile subset relevant to matching (built from career_profiles + profiles). */
export interface MatchableProfile {
  headline?: string | null;
  summary?: string | null;
  skills: string[];
  targetRoles: string[];
  experience: { company?: string; title?: string; description?: string }[];
}

/**
 * Preferences used by the deterministic pre-filter (mapped from
 * job_preferences). Stored preference strings are normalized to the canonical
 * enum values by the loader.
 */
export interface MatchPreferences {
  remoteTypes?: RemoteType[];
  employmentTypes?: EmploymentType[];
  locations?: string[];
  seniority?: string[];
}

/**
 * A job shaped for matching. Carries the DB row id (for applied-exclusion and
 * output) plus the normalized metadata fields persisted in jobs.metadata.
 */
export interface MatchableJob {
  id: string;
  source: string;
  externalId: string;
  company: string;
  title: string;
  description: string;
  location: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  seniority?: string;
  canonicalUrl?: string;
}

export type MatchVerdict = 'strong' | 'moderate' | 'weak';

/** Structured, explainable AI match output (Phase 6). */
export interface MatchResult {
  /** 0-100. */
  score: number;
  verdict: MatchVerdict;
  strengths: string[];
  gaps: string[];
  reasons: string[];
  summary: string;
}

/** A scored job with its explanation + provenance. */
export interface JobMatch {
  jobId: string;
  /** Display fields (from the source job) for the UI. */
  company: string;
  title: string;
  location: string;
  url?: string;
  score: number;
  verdict: MatchVerdict;
  strengths: string[];
  gaps: string[];
  reasons: string[];
  summary: string;
  taskId: string;
  taskVersion: number;
  provider: string;
  matchedAt: string;
}

export interface MatchOptions {
  /** Minimum score (0-100) to include in the shortlist. Default 60. */
  threshold?: number;
  /** Max jobs to send to AI scoring after deterministic filtering. Default 10. */
  maxScored?: number;
  /** Concurrency for AI scoring. Default 3. */
  concurrency?: number;
}

export interface MatchFailure {
  jobId: string;
  error: string;
}

export interface MatchingOutcome {
  /** Shortlist: matches at or above threshold, ranked by score desc. */
  matches: JobMatch[];
  /** Deterministic-filter exclusions (already-applied + preference mismatch). */
  excludedCount: number;
  /** Eligible jobs not scored because they exceeded maxScored. */
  cappedCount: number;
  /** Jobs actually sent to the AI. */
  scoredCount: number;
  /** Per-job AI failures (failure isolation, one failure does not abort the batch). */
  failures: MatchFailure[];
}
