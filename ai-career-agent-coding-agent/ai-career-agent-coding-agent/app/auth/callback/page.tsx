'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { Logo } from '@/components/site/Logo';

/**
 * OAuth landing page: Supabase redirects here from Google with a PKCE code.
 * Exchanges the code for a session, then asks the server whether this google
 * account needs the email verification gate; routes accordingly.
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
        setError('Google sign-in was cancelled or failed. You can try again or use email and password.');
        return;
      }
      const code = params.get('code');
      if (!code) {
        setError('This link is missing its sign-in code. Start again from the sign-in page.');
        return;
      }

      const { error: exchangeError } = await supabaseBrowser().auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setError('We could not finish signing you in. The link may have expired; start again.');
        return;
      }

      // MFA users (google-linked accounts with an enrolled authenticator)
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

      // Server decides the destination: google accounts still inside the
      // verification gate go to /verify-email, everyone else continues.
      try {
        const res = await fetch('/api/auth/google/verify');
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
