'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/site/AuthShell';

/**
 * Reset password page. The recovery link (generated server-side by
 * /api/auth/forgot-password) carries ?token=...&type=recovery. The page POSTs
 * the token and the new password to /api/auth/reset-password, which verifies
 * the OTP and updates the password server-side.
 */
function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    if (!token) {
      setError('This reset link is missing its token. Please request a new one.');
      setBusy(false);
      return;
    }
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);

    setBusy(false);
    if (!res || !res.ok) {
      const j = await res?.json().catch(() => null);
      setError(
        j?.error === 'INVALID_OR_EXPIRED_LINK'
          ? 'This reset link is invalid or has expired. Please request a new one.'
          : 'We could not reset your password just now. Please try again.',
      );
      return;
    }
    setDone(true);
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
