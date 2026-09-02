import type { AITask } from '@packages/ai/types';
import { ANALYZE_JOB_TASK, type JobAnalysisOutput } from './task';

/** Structural gateway dependency (the real AIGateway satisfies this). */
export interface AnalysisGateway {
  run<I, O>(task: AITask<I, O>, input: I): Promise<{ data: O; provider: string }>;
}

export interface JobAnalysis extends JobAnalysisOutput {
  matchedSkills: string[];
  missingSkills: string[];
}

/**
 * Deterministic, case-insensitive skill comparison with containment matching,
 * so "React" matches "react.js" (and vice versa) in either direction.
 * Pure — fully unit-testable.
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
 * Analyze a job description: AI extracts only what the listing states, then
 * the required skills are compared against the user's profile skills
 * deterministically (no model involvement in the comparison). Metering is
 * handled by the caller (route), so this stays pure and unit-testable.
 */
export async function analyzeJob(input: {
  gateway: AnalysisGateway;
  jobDescription: string;
  userSkills: string[];
}): Promise<JobAnalysis & { provider: string }> {
  const { data, provider } = await input.gateway.run(ANALYZE_JOB_TASK, {
    jobDescription: input.jobDescription,
  });
  const { matched, missing } = compareSkills(data.requiredSkills, input.userSkills);
  return { ...data, matchedSkills: matched, missingSkills: missing, provider };
}
