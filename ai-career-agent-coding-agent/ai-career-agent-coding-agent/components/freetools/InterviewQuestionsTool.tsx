'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function InterviewQuestionsTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="interview-question-generator" signedIn={signedIn} />;
}
