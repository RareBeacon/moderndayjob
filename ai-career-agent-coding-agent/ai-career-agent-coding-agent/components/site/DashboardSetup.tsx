'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SetupWizard } from './SetupWizard';

/**
 * DashboardSetup · the profile-setup questions, invited from the
 * dashboard instead of forced before it. New accounts see the digest
 * first, with a quiet card offering the six-step setup. It never
 * blocks existing accounts.
 *
 * Enterprise upgrade Milestone 1: accounts in the gated cohort (created
 * on/after the gate epoch, flag armed) that are still below 85% get the
 * wizard as REQUIRED instead: no skip, resumable, and protected actions
 * answer ONBOARDING_REQUIRED until it is done.
 */
export function DashboardSetup({ needsSetup, required = false }: { needsSetup: boolean; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const [later, setLater] = useState(false);
  const router = useRouter();

  if (required) {
    return (
      <div>
        <p className="dd-over" style={{ marginTop: 0 }}>Finish your setup to unlock the full product</p>
        <SetupWizard
          onFinish={() => router.refresh()}
          onSkip={() => router.refresh()}
          required
        />
      </div>
    );
  }

  if (!needsSetup) return null;
  if (open) return <SetupWizard onFinish={() => setOpen(false)} onSkip={() => setOpen(false)} />;
  if (later) return null;

  return (
    <section className="dd-setup" aria-label="Profile setup invitation">
      <div>
        <span className="dd-over">One more thing</span>
        <p>
          Your agent needs a few facts (target roles, skills, how you like to apply) before it can
          match and draft for you. Two minutes, all editable later.
        </p>
      </div>
      <div className="dd-setup-actions">
        <button type="button" className="btn" onClick={() => setOpen(true)}>Set up now</button>
        <button type="button" className="text-button" onClick={() => setLater(true)}>Later</button>
      </div>
    </section>
  );
}
