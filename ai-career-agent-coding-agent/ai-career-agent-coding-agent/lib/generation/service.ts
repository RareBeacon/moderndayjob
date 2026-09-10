import type { AITask } from '@packages/ai/types';
import type { TruthfulProfile, VerificationInput } from '@/lib/truthfulness/types';
import { verifyDocument } from '@/lib/truthfulness/verify';
import { stripDashes, stripPlaceholders } from '@/lib/ai/sanitize';
import { isPlaceholder } from '@/lib/truthfulness/extract';
import { ANSWERS_TASK, COVER_LETTER_TASK, CV_TASK } from './tasks';
import {
  buildFallbackAnswers,
  buildFallbackCV,
  buildFallbackCoverLetter,
  SAFE_FALLBACK_PROVIDER,
} from './fallback';
import type {
  AnswersOutput,
  CoverLetterOutput,
  CVOutput,
  GenerationJob,
  GenerationKind,
  GenerationProfile,
  GenerationResult,
} from './types';

/** Structural gateway dependency (the real AIGateway satisfies this). */
export interface GenerationGateway {
  run<I, O>(task: AITask<I, O>, input: I): Promise<{ data: O; provider: string }>;
}

export interface GenerateInput {
  kind: GenerationKind;
  profile: GenerationProfile;
  job?: GenerationJob;
  /** Required when kind === 'ANSWERS'. */
  questions?: string[];
  gateway?: GenerationGateway;
  /**
   * When true, skip upstream AI and use the deterministic facts-only builder.
   * The production document route enables this so users never see provider
   * failures in the resume studio.
   */
  deterministicOnly?: boolean;
}

/** Apply both content sanitizers: dashes first, then placeholder cleanup. */
const clean = (text: string) => stripPlaceholders(stripDashes(text));

/**
 * Generate a career document and verify it for truthfulness.
 *
 * The safe deterministic generator is now the product backstop: provider
 * failures, malformed JSON, schema misses, or AI drafts rejected by the
 * truthfulness gate all resolve to a verified profile-facts-only document
 * instead of a user-visible 502. The unsupported AI draft is never persisted.
 */
export async function generateDocument(input: GenerateInput): Promise<GenerationResult> {
  const truthfulProfile = toTruthfulProfile(input.profile);

  if (input.kind === 'CV') {
    if (!input.deterministicOnly && input.gateway) {
      try {
        const { data, provider } = await input.gateway.run(CV_TASK, { profile: input.profile, job: input.job });
        const aiResult = cvResult(data, provider, input.profile, input.job, truthfulProfile);
        if (aiResult.report.passed) return aiResult;
      } catch {
        // Fall through to the deterministic, verified-facts-only CV.
      }
    }
    return cvResult(buildFallbackCV(input.profile), SAFE_FALLBACK_PROVIDER, input.profile, input.job, truthfulProfile);
  }

  if (input.kind === 'COVER_LETTER') {
    if (!input.deterministicOnly && input.gateway) {
      try {
        const { data, provider } = await input.gateway.run(COVER_LETTER_TASK, {
          profile: input.profile,
          job: input.job,
        });
        const aiResult = coverLetterResult(data, provider, input.profile, input.job, truthfulProfile);
        if (aiResult.report.passed) return aiResult;
      } catch {
        // Fall through to the deterministic, verified-facts-only cover letter.
      }
    }
    return coverLetterResult(
      buildFallbackCoverLetter(input.profile, input.job),
      SAFE_FALLBACK_PROVIDER,
      input.profile,
      input.job,
      truthfulProfile,
    );
  }

  // ANSWERS
  const questions = input.questions ?? [];
  if (questions.length === 0) throw new Error('ANSWERS_REQUIRES_QUESTIONS');
  if (!input.deterministicOnly && input.gateway) {
    try {
      const { data, provider } = await input.gateway.run(ANSWERS_TASK, {
        profile: input.profile,
        job: input.job,
        questions,
      });
      const aiResult = answersResult(data, provider, input.profile, input.job, truthfulProfile);
      if (aiResult.report.passed) return aiResult;
    } catch {
      // Fall through to deterministic answers.
    }
  }
  return answersResult(
    buildFallbackAnswers(input.profile, questions),
    SAFE_FALLBACK_PROVIDER,
    input.profile,
    input.job,
    truthfulProfile,
  );
}

function cvResult(
  data: CVOutput,
  provider: string,
  _profile: GenerationProfile,
  job: GenerationJob | undefined,
  truthfulProfile: TruthfulProfile,
): GenerationResult {
  const verification = cvVerification(data);
  const report = verifyDocument(verification, truthfulProfile);
  return {
    kind: 'CV',
    title: job ? `CV, ${job.title}` : 'CV, General',
    content: clean(JSON.stringify(data, null, 2)),
    report,
    provider,
  };
}

function coverLetterResult(
  data: CoverLetterOutput,
  provider: string,
  _profile: GenerationProfile,
  job: GenerationJob | undefined,
  truthfulProfile: TruthfulProfile,
): GenerationResult {
  const report = verifyDocument(
    {
      claimedEmployers: data.references.employers.filter((e) => !isPlaceholder(e ?? '')),
      claimedSchools: data.references.schools.filter((s) => !isPlaceholder(s ?? '')),
      claimedSkills: data.references.skills.filter((s) => !isPlaceholder(s ?? '')),
      text: data.body,
    },
    truthfulProfile,
  );
  return {
    kind: 'COVER_LETTER',
    title: job ? `Cover letter, ${job.company}` : 'Cover letter, General',
    content: clean(data.body),
    report,
    provider,
  };
}

function answersResult(
  data: AnswersOutput,
  provider: string,
  _profile: GenerationProfile,
  job: GenerationJob | undefined,
  truthfulProfile: TruthfulProfile,
): GenerationResult {
  const answerText = clean(data.answers.map((a) => a.answer).join('\n\n'));
  const report = verifyDocument(
    {
      claimedEmployers: data.references.employers.filter((e) => !isPlaceholder(e ?? '')),
      claimedSchools: data.references.schools.filter((s) => !isPlaceholder(s ?? '')),
      claimedSkills: data.references.skills.filter((s) => !isPlaceholder(s ?? '')),
      // Questions are untrusted prompts, not candidate claims; verify answers only.
      text: answerText,
    },
    truthfulProfile,
  );
  return {
    kind: 'ANSWERS',
    title: job ? `Answers, ${job.company}` : 'Answers, General',
    content: clean(JSON.stringify(data, null, 2)),
    report,
    provider,
  };
}

/** Build the truthfulness profile (verified facts) from the generation profile. */
export function toTruthfulProfile(profile: GenerationProfile): TruthfulProfile {
  const verifiedText = [
    profile.headline,
    profile.summary,
    ...(profile.targetRoles ?? []),
    ...profile.experience.flatMap((e) => [e.company, e.title, e.description]),
    ...profile.education.flatMap((e) => [e.institution, e.qualification]),
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ');
  return {
    // Include headline and target roles as source facts too; otherwise a user
    // supplied headline like "AWS Certified Engineer" could be falsely rejected
    // when the deterministic CV repeats it.
    summary: verifiedText,
    skills: profile.skills,
    employers: profile.experience.map((e) => e.company ?? '').filter(Boolean),
    schools: profile.education.map((e) => e.institution ?? '').filter(Boolean),
    experienceText: verifiedText,
  };
}

/** Extract claimed entities + scannable text from a structured CV. */
function cvVerification(cv: CVOutput): VerificationInput {
  const text = [
    cv.headline,
    cv.summary,
    ...cv.experiences.flatMap((e) => e.bullets),
  ].join('\n');
  return {
    claimedEmployers: cv.experiences.map((e) => e.company).filter((c) => !isPlaceholder(c ?? '')),
    claimedSchools: cv.education.map((e) => e.institution).filter((s) => !isPlaceholder(s ?? '')),
    claimedSkills: cv.skills.filter((s) => !isPlaceholder(s ?? '')),
    text,
  };
}

/** Re-export output types for route/test convenience. */
export type { AnswersOutput, CoverLetterOutput, CVOutput };
