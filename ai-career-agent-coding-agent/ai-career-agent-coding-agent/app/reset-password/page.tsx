'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/site/AuthShell';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Reset password page.
 *
 * The recovery link points at Supabase's verify endpoint, which redirects here
 * with the session in the URL fragment: /reset-password#access_token=...&type=
 * recovery (NOT ?token=...). The browser client consumes the fragment into
 * cookies on load; the form then POSTs just the new password, and the server
 * route authorizes the change from the recovery session.
 *
 * A ?token=... query parameter (older link shape / manual paste) is still
 * honored and sent to the API, which verifies it against GoTrue directly.
 */
function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Wait (briefly) for the browser client to consume a #access_token fragment
  // into the cookie session. detectSessionInUrl does this on client init.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        try {
          const { data } = await supabaseBrowser().auth.getSession();
          if (data.session) {
            if (!cancelled) setHasSession(true);
            break;
          }
        } catch {
          // retry - client init may still be in flight
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    if (password.length < 8) {
      setError('Your new password needs at least 8 characters.');
      setBusy(false);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      setBusy(false);
      return;
    }

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token ? { token, password } : { password }),
    }).catch(() => null);

    setBusy(false);
    if (!res || !res.ok) {
      const j = await res?.json().catch(() => null);
      setError(
        j?.error === 'INVALID_OR_EXPIRED_LINK' || j?.error === 'NO_RESET_SESSION'
          ? 'This reset link is invalid or has expired. Please request a new one.'
          : 'We could not reset your password just now. Please try again.',
      );
      return;
    }
    setDone(true);
    // The recovery session has served its purpose; require a fresh sign-in.
    supabaseBrowser()
      .auth.signOut()
      .catch(() => {});
    setTimeout(() => router.push('/login'), 1800);
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You can sign in with your new password now.">
        <p className="ok-note">Password updated. Taking you to sign in.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Enter a new password for your Jobiest account.">
      {checking ? (
        <p className="muted" role="status">Checking your reset link…</p>
      ) : !token && !hasSession ? (
        <p className="form-error" role="alert">
          This reset link is missing its token or has expired. Please request a new one.
        </p>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Updating password...' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
