'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { Logo } from '@/components/site/Logo';

/**
 * OAuth landing page: Supabase redirects here from Google or LinkedIn with
 * a PKCE code. IMPORTANT: the @supabase/ssr browser client has
 * detectSessionInUrl enabled, which exchanges the code for a session
 * AUTOMATICALLY the moment the client initialises (and then deletes the
 * one-time verifier). This page therefore NEVER exchanges the code itself -
 * doing so double-spends the code and always fails (that was the 2026-09-21
 * "Sign-in incomplete" bug). Here we only: read any OAuth error params,
 * confirm the auto-created session, then follow MFA / email-verification /
 * account-completion routing.
 */
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      // Read params first: the auto-exchange scrubs ?code from the URL.
      const oauthError = params.get('error_description') || params.get('error');
      const next = params.get('next');
      if (oauthError) {
        setError('Sign-in was cancelled or failed. You can try again or use email and password.');
        return;
      }

      // The client already exchanged the code during initialisation;
      // getSession() waits for that and reports the result.
      const { data: sessionData } = await supabaseBrowser().auth.getSession();
      const session = sessionData?.session ?? null;
      if (!session) {
        try {
          void fetch('/api/client-error', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: 'oauth callback landed without a session (auto-exchange failed)',
              path: '/auth/callback',
            }),
            keepalive: true,
          });
        } catch {
          /* never block recovery */
        }
        setError('We could not finish signing you in. Please start again from the sign-in page; if it repeats, use a regular browser window (not an in-app one).');
        return;
      }

      // MFA users (social accounts with an enrolled authenticator)
      // continue at the second-factor step before any app page opens.
      try {
        const { data: aal } = await supabaseBrowser().auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
          router.replace('/mfa-verify');
          return;
        }
      } catch {
        // middleware re-checks
      }

      // Server decides the destination: social accounts still inside the
      // verification gate go to /verify-email, everyone else continues.
      // The gate endpoint follows the session's provider.
      try {
        const providers = session.user?.app_metadata?.providers ?? [];
        const gate = providers.includes('linkedin_oidc') || providers.includes('linkedin')
          ? '/api/auth/linkedin/verify'
          : '/api/auth/google/verify';
        const res = await fetch(gate);
        if (res.ok) {
          const state = (await res.json()) as { requiresVerification?: boolean };
          if (state.requiresVerification) {
            router.replace('/verify-email');
            return;
          }
        }
      } catch {
        // State check is best-effort; the middleware re-checks anyway.
      }

      const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
      router.replace(safe);
      router.refresh();
    })();
  }, [params, router]);

  return (
    <main className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <Logo className="logo center" />
        {error ? (
          <>
            <h1>Sign-in incomplete</h1>
            <p className="sub">{error}</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
              <Link className="btn" href="/login" style={{ textDecoration: 'none' }}>
                Back to sign in
              </Link>
              <Link className="btn-ghost" href="/signup" style={{ textDecoration: 'none' }}>
                Create an account
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="spinner" style={{ margin: '0 auto 16px' }} role="status" aria-label="Signing you in" />
            <h1>Finishing sign-in…</h1>
            <p className="sub">One moment while we bring you in.</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
