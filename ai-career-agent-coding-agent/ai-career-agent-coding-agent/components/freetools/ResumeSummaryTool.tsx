'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function ResumeSummaryTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="resume-summary-generator" signedIn={signedIn} />;
}
