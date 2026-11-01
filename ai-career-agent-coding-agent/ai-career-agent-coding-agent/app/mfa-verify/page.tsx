'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';

/**
 * Second factor step of the login flow. Supports:
 *  1. Standard 6-digit TOTP authenticator verification via Supabase MFA.
 *  2. Single-use backup recovery code verification via /api/auth/mfa/verify-recovery.
 * An unverified aal1 session never gains access to protected pages or APIs.
 */
export default function MfaVerifyPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
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

  const finishRedirect = useCallback(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    router.replace(next && next.startsWith('/') && !next.startsWith('//') && !next.includes('://') ? next : '/dashboard');
    router.refresh();
  }, [router]);

  const verifyTotp = useCallback(async () => {
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
      try {
        await fetch('/api/auth/session', { method: 'POST' });
      } catch {}
      finishRedirect();
    } finally {
      setBusy(false);
    }
  }, [code, finishRedirect]);

  const verifyRecovery = useCallback(async () => {
    if (recoveryCode.trim().length < 8) {
      setError('Enter one of your single-use backup recovery codes.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/verify-recovery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: recoveryCode.trim() }),
      });
      const out = await res.json();
      if (!res.ok || !out.ok) {
        setError(out.message ?? 'Invalid or already used backup recovery code.');
        return;
      }
      finishRedirect();
    } catch {
      setError('Could not verify your recovery code right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [recoveryCode, finishRedirect]);

  const useAnotherAccount = useCallback(async () => {
    await supabaseBrowser().auth.signOut().catch(() => {});
    router.replace('/login');
  }, [router]);

  return (
    <AuthShell
      title="Verify it's you"
      subtitle={
        mode === 'totp'
          ? 'Enter the 6-digit code from your authenticator app.'
          : 'Enter one of your single-use backup recovery codes.'
      }
    >
      {error ? (
        <div className="auth-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      {mode === 'totp' ? (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void verifyTotp();
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
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void verifyRecovery();
          }}
          noValidate
        >
          <label>
            Backup recovery code
            <input
              type="text"
              autoComplete="off"
              maxLength={20}
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              disabled={!ready}
              style={{ fontFamily: 'monospace', letterSpacing: 1.5 }}
              autoFocus
            />
          </label>
          <button type="submit" className="btn btn-block" disabled={busy || !ready}>
            {busy ? 'Verifying backup code…' : 'Verify backup code'}
          </button>
        </form>
      )}

      <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
        <button
          type="button"
          className="btn-ghost btn-block"
          disabled={busy}
          onClick={() => {
            setError('');
            setMode((prev) => (prev === 'totp' ? 'recovery' : 'totp'));
          }}
        >
          {mode === 'totp' ? 'Use a backup recovery code instead' : 'Use 6-digit authenticator code instead'}
        </button>
        <button type="button" className="btn-ghost btn-block" onClick={useAnotherAccount} disabled={busy}>
          Use a different account
        </button>
      </div>
    </AuthShell>
  );
}
