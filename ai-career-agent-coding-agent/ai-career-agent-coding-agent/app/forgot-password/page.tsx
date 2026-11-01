'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/site/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Enter the email address associated with your Jobiest account.');
      setBusy(false);
      return;
    }

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    }).catch(() => null);

    setBusy(false);
    if (res && res.status === 429) {
      setError('Too many reset requests from this connection. Please wait a few minutes and try again.');
      return;
    }
    if (!res || !res.ok) {
      setError('We could not send a reset email right now. Please try again shortly.');
      return;
    }
    setSubmitted(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we will send a secure link to choose a new password."
    >
      {submitted ? (
        <div>
          <p className="ok-note" role="status">
            If an account exists for <strong>{email.trim()}</strong>, a password reset link is on its way. Check your inbox and spam folder.
          </p>
          <p style={{ marginTop: 14, fontSize: 13.5 }}>
            <Link href="/login" className="inline-link">Return to sign in</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="auth-form">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Sending reset link...' : 'Send reset link'}
          </button>
          <p style={{ marginTop: 14, fontSize: 13.5 }}>
            Remembered your password? <Link href="/login" className="inline-link">Sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
