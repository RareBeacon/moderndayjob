'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function CoverLetterTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="cover-letter-writer" signedIn={signedIn} />;
}
