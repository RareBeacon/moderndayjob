'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Sign out with confirmation (Settings -> Account). Confirming posts the
 * existing /api/auth/signout form endpoint, which terminates the Supabase
 * session server-side and clears the auth cookies; the router then lands
 * on /login. Signing out never deletes any account data.
 */
export function SignOutCard() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {
      // the endpoint also works as a plain form post; fetch failure here
      // still leaves cookies cleared server-side in the common case
    }
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <div>
          <strong>Sign out</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
            End this session on this device. Your profile, documents and applications are kept.
          </p>
        </div>
      </div>
      {!confirming ? (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn-ghost" onClick={() => setConfirming(true)}>
            Sign out
          </button>
        </div>
      ) : (
        <div className="settings-confirm" role="dialog" aria-modal="true" aria-label="Sign out of Jobiest?">
          <strong>Sign out of Jobiest?</strong>
          <p className="muted" style={{ margin: '8px 0 16px', fontSize: 14 }}>
            You&apos;ll need to sign in again to access your account.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn" onClick={signOut} disabled={busy}>
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
