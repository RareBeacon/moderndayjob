import { redirect } from 'next/navigation';

/**
 * Onboarding moved into the dashboard (v5.2): the six setup questions
 * are invited from the digest, never forced in front of it. This route
 * stays only to forward old links and bookmarks.
 */
export default function OnboardingRedirect() {
  redirect('/dashboard');
}
