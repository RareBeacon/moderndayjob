'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';
import { humanizeAuthError } from '@/lib/auth-messages';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    let { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });

    // Legacy accounts created before auto-confirmation: if the password
    // was right but the email was never confirmed, confirm it now and
    // retry, so nobody is locked out of an account they own.
    if (error && (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message))) {
      const res = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => null);
      if (res && res.ok) {
        ({ error } = await supabaseBrowser().auth.signInWithPassword({ email, password }));
      }
    }

    setBusy(false);
    if (error) {
      setError(humanizeAuthError(error.message));
      return;
    }
    const next = new URLSearchParams(window.location.search).get('next') || '/dashboard';
    router.push(next);
    router.refresh();
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your Jobiest workspace.">
      <form onSubmit={submit} className="auth-form" noValidate>
        {error ? <div className="auth-error" role="alert">{error}</div> : null}
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <div className="control">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="field-toggle"
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow((v) => !v)}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <button type="submit" className="btn btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-foot">
        New to Jobiest? <Link href="/signup">Create a free account</Link>
      </p>
    </AuthShell>
  );
}
