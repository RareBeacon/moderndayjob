'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function SalaryInsightsTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="salary-insights" signedIn={signedIn} />;
}
