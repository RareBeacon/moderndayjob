'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';
import { GoogleButton } from '@/components/site/GoogleButton';
import { LinkedInButton } from '@/components/site/LinkedInButton';
import { humanizeAuthError } from '@/lib/auth-messages';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(() => {
    // Prefill after verification (/verify-email sends the user here).
    const pre = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('email') ?? '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(pre) ? pre : '';
  });
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verified = params.get('verified') === '1';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    let { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });

    // Unverified accounts: send the owner to the verification page (the code
    // was emailed at signup; a new one can be requested there). The password
    // was proven correct to reach this error, but activation now requires
    // the emailed 6-digit code - never a silent server-side confirm.
    if (error && (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message))) {
      setBusy(false);
      router.replace(`/verify-email?email=${encodeURIComponent(email)}`);
      return;
    }

    setBusy(false);
    if (error) {
      setError(humanizeAuthError(error.message));
      return;
    }
    // MFA is part of the real login flow: if the user has an enrolled
    // authenticator, the session stays aal1 until the code is verified.
    try {
      const { data: aal } = await supabaseBrowser().auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const nextParam = new URLSearchParams(window.location.search).get('next');
        router.push(nextParam ? `/mfa-verify?next=${encodeURIComponent(nextParam)}` : '/mfa-verify');
        return;
      }
    } catch {
      // fall through to the dashboard; middleware re-checks
    }
    const next = new URLSearchParams(window.location.search).get('next') || '/dashboard';
    router.push(next);
    router.refresh();
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your Jobiest workspace.">
      {verified ? (
        <div className="auth-success" role="status" style={{ marginTop: 16 }}>
          Your email is verified. Enter your password to continue.
        </div>
      ) : null}
      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        <LinkedInButton />
        <GoogleButton />
      </div>
      <div className="auth-divider" style={{ margin: '18px 0' }}><span>or with email</span></div>
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
