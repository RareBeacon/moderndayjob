'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * "Continue with LinkedIn" for the login and signup pages. Starts the
 * Supabase OAuth flow (PKCE) with LinkedIn's OpenID Connect provider;
 * LinkedIn's consent screen decides sign-in vs implicit account creation.
 * The round trip lands on /auth/callback, which routes new linkedin
 * accounts into the same email verification gate as Google.
 *
 * Works the moment the linkedin_oidc provider is configured in Supabase;
 * until then the click explains calmly that email and password are the way
 * in (an honest button, never a dead one).
 */
export function LinkedInButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    if (busy) return;
    setBusy(true);
    setError('');
    const next = new URLSearchParams(window.location.search).get('next');
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    const { error: oauthError } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo },
    });
    if (oauthError) {
      const unavailable = /provider|support|enabled|invalid|not found/i.test(oauthError.message);
      setError(
        unavailable
          ? 'LinkedIn sign-in is not enabled yet. Use email and password for now.'
          : 'Could not start LinkedIn sign-in. Please try again.',
      );
      setBusy(false);
    }
    // On success the browser leaves for LinkedIn; nothing left to do here.
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <button type="button" className="google-btn" onClick={go} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
          <path fill="#0A66C2" d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
        </svg>
        {busy ? 'Redirecting to LinkedIn…' : 'Continue with LinkedIn'}
      </button>
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
