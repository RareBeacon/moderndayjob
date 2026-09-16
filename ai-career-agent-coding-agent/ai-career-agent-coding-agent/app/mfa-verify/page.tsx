'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';

/**
 * Second factor step of the real login flow. Reached when the password (or
 * Google) step succeeded but the session is still aal1 and the user has an
 * enrolled authenticator. The session is NOT usable for the app until this
 * completes: middleware routes aal1 sessions back here and requireUser
 * rejects aal1 API calls. Codes are verified by Supabase, never locally.
 */
export default function MfaVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: aal } = await supabaseBrowser().auth.mfa.getAuthenticatorAssuranceLevel();
        if (!(aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2')) {
          router.replace('/dashboard');
          return;
        }
      } catch {
        // stay; the verify attempt will surface real errors
      }
      setReady(true);
    })();
  }, [router]);

  const verify = useCallback(async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: factors } = await supabaseBrowser().auth.mfa.listFactors();
      const factor = (factors?.all ?? []).find((f) => f.status === 'verified');
      if (!factor) {
        setError('No authenticator is enrolled on this account. Contact support.');
        return;
      }
      const { data: challenge, error: challengeError } = await supabaseBrowser().auth.mfa.challenge({ factorId: factor.id });
      if (challengeError || !challenge) {
        setError('Could not create a verification challenge. Try again.');
        return;
      }
      const { error: verifyError } = await supabaseBrowser().auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) {
        setError(
          verifyError.message.toLowerCase().includes('invalid')
            ? 'That code is not right or has expired. Check your authenticator app and try again.'
            : verifyError.message,
        );
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [code, router]);

  const useAnotherAccount = useCallback(async () => {
    await supabaseBrowser().auth.signOut().catch(() => {});
    router.replace('/login');
  }, [router]);

  return (
    <AuthShell title="Verify it's you" subtitle="Enter the 6-digit code from your authenticator app.">
      {error ? (
        <div className="auth-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
        noValidate
      >
        <label>
          Authenticator code
          <input
            className="verify-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            disabled={!ready}
            autoFocus
          />
        </label>
        <button type="submit" className="btn btn-block" disabled={busy || !ready}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </form>
      <div style={{ marginTop: 16 }}>
        <button type="button" className="btn-ghost btn-block" onClick={useAnotherAccount} disabled={busy}>
          Use a different account
        </button>
      </div>
    </AuthShell>
  );
}
