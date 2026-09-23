'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * AutoSubmitToggle · the user-facing on/off button for automatic
 * submission. One binary choice: 'auto' (the agent sends eligible
 * applications within the user's rules) or 'approval' (every send waits
 * for a human approval). Persisted to job_preferences.application_mode
 * via POST /api/preferences/mode; the send path re-checks everything
 * server-side, so this control only ever expresses a preference.
 *
 * Honesty rules baked into the copy: the plan gate (paid plans), the
 * platform go-live state (sendingLive) and the hard stops (CAPTCHA,
 * logins, unsupported sites, never LinkedIn Easy Apply or Indeed Apply)
 * are all stated, never hidden. Finer modes (draft, assist) stay in the
 * setup wizard; this control only flips auto against approval.
 */
export function AutoSubmitToggle({
  initialMode,
  planIncludesAutomation,
  sendingLive,
}: {
  initialMode: string;
  planIncludesAutomation: boolean;
  sendingLive: boolean;
}) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const on = mode === 'auto';

  async function toggle() {
    if (busy) return;
    const next = on ? 'approval' : 'auto';
    setBusy(true);
    setNote('');
    try {
      const r = await fetch('/api/preferences/mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ application_mode: next }),
      });
      if (r.ok) {
        setMode(next);
        setNote('Saved.');
      } else if (r.status === 429) {
        setNote('Too many changes just now. Try again in a minute.');
      } else {
        const body = await r.json().catch(() => null);
        setNote(
          body?.error === 'ONBOARDING_REQUIRED'
            ? 'Finish your profile setup first. The remaining questions are on your dashboard.'
            : 'Could not save your choice. Please try again.',
        );
      }
    } catch {
      setNote('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!planIncludesAutomation) {
    return (
      <div>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
          Automatic submission sends eligible applications for you on supported employer sites,
          within your rules, then emails you after each one. It is part of the paid plans.
        </p>
        <Link
          className="btn-ghost"
          href="/pricing"
          style={{ marginTop: 14, textDecoration: 'none', display: 'inline-block' }}
        >
          See plans
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }} role="status">
        <span className={`auto-dot${on ? ' on' : ''}`} aria-hidden="true" />
        {on ? 'On for this account' : 'Off for this account'}
      </p>
      <p className="muted" style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.55 }}>
        {on
          ? "Your agent submits eligible applications for you on supported employer sites, within your rules, and emails you after each one. It applies through employers' own career sites only, never LinkedIn Easy Apply or Indeed Apply, and stops on CAPTCHA, logins, and unsupported sites."
          : 'Your agent prepares every application and waits for your approval before anything is sent. Turn this on and it submits eligible applications for you on supported employer sites, within your rules, then emails you after each one.'}
      </p>
      {on && !sendingLive && (
        <p className="muted" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          Your choice is saved. Sending starts once final checks are complete; until then every
          application still waits for your approval.
        </p>
      )}
      <button
        type="button"
        className={on ? 'btn-ghost' : 'btn'}
        onClick={toggle}
        disabled={busy}
        style={{ marginTop: 14 }}
        aria-pressed={on}
      >
        {busy ? 'Saving…' : on ? 'Turn off automatic submission' : 'Turn on automatic submission'}
      </button>
      {note ? (
        <p className="form-status" role="status" style={{ margin: '10px 0 0' }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
