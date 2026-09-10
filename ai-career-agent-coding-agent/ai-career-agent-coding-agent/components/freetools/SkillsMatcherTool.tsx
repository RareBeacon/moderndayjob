'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function SkillsMatcherTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="skills-matcher" signedIn={signedIn} />;
}
