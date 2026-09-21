'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { Logo } from '@/components/site/Logo';

/**
 * OAuth landing page: Supabase redirects here from Google or LinkedIn with
 * a PKCE code. Exchanges the code for a session, then asks the server
 * whether this social account needs the email verification gate; routes
 * accordingly.
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
      const oauthError = params.get('error_description') || params.get('error');
      if (oauthError) {
        setError('Sign-in was cancelled or failed. You can try again or use email and password.');
        return;
      }
      const code = params.get('code');
      if (!code) {
        setError('This link is missing its sign-in code. Start again from the sign-in page.');
        return;
      }

      const { error: exchangeError } = await supabaseBrowser().auth.exchangeCodeForSession(code);
      if (exchangeError) {
        // Best-effort diagnosis: the exact provider message (bounded, no
        // tokens) lands in the audit trail so support can tell "code
        // expired" (slow consent screen) from "verifier cookie missing"
        // (browser blocked cookies / in-app browser).
        try {
          void fetch('/api/client-error', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: `auth-code-exchange failed: ${String(exchangeError.code ?? '')} ${String(exchangeError.message ?? '').slice(0, 200)}`.slice(0, 400),
              path: '/auth/callback',
            }),
            keepalive: true,
          });
        } catch {
          /* never block recovery */
        }
        setError('We could not finish signing you in. This can happen when the permission screen takes too long or your browser blocks cookies. Please try again; use a regular browser window (not an in-app one) if it repeats.');
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
        let providers: string[] = [];
        try {
          const { data: sessionData } = await supabaseBrowser().auth.getSession();
          providers = sessionData?.session?.user?.app_metadata?.providers ?? [];
        } catch {
          /* fall back to the google gate below */
        }
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

      const next = params.get('next');
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
