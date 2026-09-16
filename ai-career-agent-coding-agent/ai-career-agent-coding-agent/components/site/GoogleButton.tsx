'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * "Continue with Google" for the login and signup pages. Starts the Supabase
 * OAuth flow (PKCE); Google's consent screen decides sign-in vs implicit
 * account creation. The round trip lands on /auth/callback, which routes
 * new google accounts into the email verification gate.
 *
 * Works the moment the google provider is configured in Supabase; until then
 * the click explains calmly that email and password are the way in.
 */
export function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    if (busy) return;
    setBusy(true);
    setError('');
    const next = new URLSearchParams(window.location.search).get('next');
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    const { error: oauthError } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    });
    if (oauthError) {
      const unavailable = /provider|support|enabled|invalid/i.test(oauthError.message);
      setError(
        unavailable
          ? 'Google sign-in is not enabled yet. Use email and password for now.'
          : 'Could not start Google sign-in. Please try again.',
      );
      setBusy(false);
    }
    // On success the browser leaves for Google; nothing left to do here.
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <button type="button" className="google-btn" onClick={go} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: 'none' }}>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A8.99 8.99 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.09l3.01-2.34Z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
        </svg>
        {busy ? 'Redirecting to Google…' : 'Continue with Google'}
      </button>
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
