'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function LinkedInHeadlineTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="linkedin-headline-builder" signedIn={signedIn} />;
}
