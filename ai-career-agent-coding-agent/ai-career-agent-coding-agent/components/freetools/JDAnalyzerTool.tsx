'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function JDAnalyzerTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="job-description-analyzer" signedIn={signedIn} />;
}
