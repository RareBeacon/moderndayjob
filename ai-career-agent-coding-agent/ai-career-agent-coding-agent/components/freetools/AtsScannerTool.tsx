'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function AtsScannerTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="ats-resume-scanner" signedIn={signedIn} />;
}
