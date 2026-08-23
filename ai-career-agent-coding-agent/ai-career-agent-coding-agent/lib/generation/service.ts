import type { AITask } from '@packages/ai/types';
import type { TruthfulProfile, VerificationInput } from '@/lib/truthfulness/types';
import { verifyDocument } from '@/lib/truthfulness/verify';
import { ANSWERS_TASK, COVER_LETTER_TASK, CV_TASK } from './tasks';
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
  gateway: GenerationGateway;
}

/**
 * Generate a career document and verify it for truthfulness.
 *
 * Flow: pick the versioned task → run it through the gateway → extract the
 * claimed entities + text → verify against the profile → return the serialized
 * content + the truthfulness report. Metering is handled by the caller (route),
 * so this stays pure and unit-testable with a mock gateway.
 */
export async function generateDocument(input: GenerateInput): Promise<GenerationResult> {
  const truthfulProfile = toTruthfulProfile(input.profile);

  if (input.kind === 'CV') {
    const { data, provider } = await input.gateway.run(CV_TASK, { profile: input.profile, job: input.job });
    const verification = cvVerification(data);
    const report = verifyDocument(verification, truthfulProfile);
    return {
      kind: 'CV',
      title: input.job ? `CV — ${input.job.title}` : 'CV — General',
      content: JSON.stringify(data, null, 2),
      report,
      provider,
    };
  }

  if (input.kind === 'COVER_LETTER') {
    const { data, provider } = await input.gateway.run(COVER_LETTER_TASK, {
      profile: input.profile,
      job: input.job,
    });
    const report = verifyDocument(
      { claimedEmployers: data.references.employers, claimedSchools: data.references.schools, claimedSkills: data.references.skills, text: data.body },
      truthfulProfile,
    );
    return {
      kind: 'COVER_LETTER',
      title: input.job ? `Cover letter — ${input.job.company}` : 'Cover letter — General',
      content: data.body,
      report,
      provider,
    };
  }

  // ANSWERS
  const questions = input.questions ?? [];
  if (questions.length === 0) throw new Error('ANSWERS_REQUIRES_QUESTIONS');
  const { data, provider } = await input.gateway.run(ANSWERS_TASK, {
    profile: input.profile,
    job: input.job,
    questions,
  });
  const text = data.answers.map((a) => `${a.question}\n${a.answer}`).join('\n\n');
  const report = verifyDocument(
    { claimedEmployers: data.references.employers, claimedSchools: data.references.schools, claimedSkills: data.references.skills, text },
    truthfulProfile,
  );
  return {
    kind: 'ANSWERS',
    title: input.job ? `Answers — ${input.job.company}` : 'Answers — General',
    content: JSON.stringify(data, null, 2),
    report,
    provider,
  };
}

/** Build the truthfulness profile (verified facts) from the generation profile. */
export function toTruthfulProfile(profile: GenerationProfile): TruthfulProfile {
  return {
    summary: profile.summary ?? '',
    skills: profile.skills,
    employers: profile.experience.map((e) => e.company ?? '').filter(Boolean),
    schools: profile.education.map((e) => e.institution ?? '').filter(Boolean),
    experienceText: profile.experience.map((e) => e.description ?? '').filter(Boolean).join(' '),
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
    claimedEmployers: cv.experiences.map((e) => e.company),
    claimedSchools: cv.education.map((e) => e.institution),
    claimedSkills: cv.skills,
    text,
  };
}

/** Re-export output types for route/test convenience. */
export type { AnswersOutput, CoverLetterOutput, CVOutput };
