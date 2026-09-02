import type { AITask } from '@packages/ai/types';
import { verifyDocument } from '@/lib/truthfulness/verify';
import { toTruthfulProfile } from '@/lib/generation/service';
import type { GenerationProfile } from '@/lib/generation/types';
import {
  ANALYZE_JOB_TASK,
  CAREER_PATHS_TASK,
  FOLLOWUP_EMAIL_TASK,
  INTERVIEW_QUESTIONS_TASK,
  LINKEDIN_HEADLINE_TASK,
  PROFILE_SUMMARY_TASK,
  SALARY_INSIGHTS_TASK,
  type InterviewQuestionsOutput,
  type JobAnalysisOutput,
} from './task';

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

/**
 * Generate interview practice questions grounded in what the listing states.
 * Questions are guidance, not claims about the user, so there is no
 * truthfulness check — but the prompt forbids inventing requirements.
 */
export async function generateInterviewQuestions(input: {
  gateway: AnalysisGateway;
  jobDescription: string;
}): Promise<InterviewQuestionsOutput & { provider: string }> {
  const { data, provider } = await input.gateway.run(INTERVIEW_QUESTIONS_TASK, {
    jobDescription: input.jobDescription,
  });
  return { ...data, provider };
}

export type ProfileCopyKind = 'SUMMARY' | 'HEADLINE';

/**
 * Generate resume-summary or LinkedIn-headline options from verified profile
 * facts, then run the deterministic truthfulness checker over the result.
 * The route rejects (and refunds) when report.passed is false — same contract
 * as the workspace document generators.
 */
export async function generateProfileCopy(input: {
  gateway: AnalysisGateway;
  kind: ProfileCopyKind;
  profile: GenerationProfile;
}): Promise<{ kind: ProfileCopyKind; options: string[]; report: ReturnType<typeof verifyDocument>; provider: string }> {
  const task = input.kind === 'HEADLINE' ? LINKEDIN_HEADLINE_TASK : PROFILE_SUMMARY_TASK;
  const { data, provider } = await input.gateway.run(task, { profile: input.profile });
  const truthfulProfile = toTruthfulProfile(input.profile);
  const report = verifyDocument(
    {
      claimedEmployers: data.references.employers,
      claimedSchools: data.references.schools,
      claimedSkills: data.references.skills,
      text: data.options.join('\n'),
    },
    truthfulProfile,
  );
  return { kind: input.kind, options: data.options, report, provider };
}

/** Follow-up email — drafted from user-supplied facts (no qualification claims). */
export async function generateFollowupEmail(input: {
  gateway: AnalysisGateway;
  company: string;
  role: string;
  daysSinceApplied: number;
  contactName?: string;
  note?: string;
}): Promise<{ subject: string; body: string; provider: string }> {
  const { data, provider } = await input.gateway.run(FOLLOWUP_EMAIL_TASK, {
    company: input.company,
    role: input.role,
    daysSinceApplied: input.daysSinceApplied,
    contactName: input.contactName,
    note: input.note,
  });
  return { subject: data.subject, body: data.body, provider };
}

/**
 * Career path suggestions from verified skills. Deterministic guard: every
 * skill cited in `buildingOn` must exist in the profile skills (containment
 * match, same normalization as compareSkills). Violations → verified:false
 * and the route rejects + refunds.
 */
export async function generateCareerPaths(input: {
  gateway: AnalysisGateway;
  profile: GenerationProfile;
}): Promise<{ paths: import('./task').CareerPathsOutput['paths']; summary: string; verified: boolean; unsupportedSkills: string[]; provider: string }> {
  const { data, provider } = await input.gateway.run(CAREER_PATHS_TASK, { profile: input.profile });
  const userSkills = input.profile.skills.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const supported = (cited: string) => {
    const c = cited.trim().toLowerCase();
    return userSkills.some((u) => u === c || (u.length >= 3 && c.includes(u)) || (c.length >= 3 && u.includes(c)));
  };
  const unsupportedSkills = Array.from(new Set(data.paths.flatMap((p) => p.buildingOn.filter((s) => !supported(s)))));
  return {
    paths: data.paths,
    summary: data.summary,
    verified: unsupportedSkills.length === 0,
    unsupportedSkills,
    provider,
  };
}

/**
 * Salary insights from real listings. Deterministic guard: every cited jobId
 * must belong to the scanned set — a range attributed to a listing we never
 * read is fabrication and fails verification.
 */
export async function generateSalaryInsights(input: {
  gateway: AnalysisGateway;
  jobs: { id: string; title: string; company: string; description: string }[];
}): Promise<{ ranges: import('./task').SalaryInsightsOutput['statedRanges']; notes: string; verified: boolean; provider: string }> {
  const { data, provider } = await input.gateway.run(SALARY_INSIGHTS_TASK, { jobs: input.jobs });
  const ids = new Set(input.jobs.map((j) => j.id));
  const verified = data.statedRanges.every((r) => ids.has(r.jobId));
  return { ranges: data.statedRanges, notes: data.notes, verified, provider };
}
