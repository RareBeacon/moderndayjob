'use client';
import { FreeToolExperience } from './FreeToolExperience';

export function FollowupEmailTool({ signedIn }: { signedIn: boolean }) {
  return <FreeToolExperience toolId="follow-up-email-writer" signedIn={signedIn} />;
}
