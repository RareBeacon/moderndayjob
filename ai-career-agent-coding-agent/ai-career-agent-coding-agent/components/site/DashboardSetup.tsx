'use client';
import { useState } from 'react';
import { SetupWizard } from './SetupWizard';

/**
 * DashboardSetup · the profile-setup questions, invited from the
 * dashboard instead of forced before it. New accounts see the digest
 * first, with a quiet card offering the six-step setup. It never
 * blocks, never redirects, and disappears once target roles exist.
 */
export function DashboardSetup({ needsSetup }: { needsSetup: boolean }) {
  const [open, setOpen] = useState(false);
  const [later, setLater] = useState(false);

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
