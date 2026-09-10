'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function CareerPathsTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="career-path-explorer" signedIn={signedIn} />;
}
