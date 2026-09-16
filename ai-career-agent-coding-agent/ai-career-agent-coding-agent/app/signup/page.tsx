'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';
import { humanizeAuthError } from '@/lib/auth-messages';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    const attribution = (() => {
      if (typeof window === 'undefined') return undefined;
      const params = new URLSearchParams(window.location.search);
      return {
        source: params.get('utm_source') || undefined,
        sourceArticle: params.get('utm_content') || params.get('source_article') || undefined,
        sourceTool: params.get('source_tool') || undefined,
        anonymousId: window.localStorage.getItem('jobiest.freeTools.anonymousId') || undefined,
        sourceUrl: document.referrer || undefined,
        targetUrl: window.location.href,
      };
    })();

    // 1. Create the account server-side, ready to use: no email
    //    round-trip, the account works the second it exists.
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, attribution }),
    }).catch(() => null);

    if (res && res.status === 409) {
      const { error: msg } = await res.json().catch(() => ({ error: '' }));
      setError(msg || 'An account with this email already exists. Sign in instead.');
      setBusy(false);
      return;
    }

    if (!res || !res.ok) {
      // Fallback: classic client-side signup (covers the unlikely case
      // of the server route being unavailable). If email confirmation
      // kicks in there, the user still gets a clear notice.
      const { data, error } = await supabaseBrowser().auth.signUp({
        email,
        password,
      });
      if (error) {
        setError(humanizeAuthError(error.message));
        setBusy(false);
        return;
      }
      if (data.session) {
        router.push('/dashboard');
        router.refresh();
        return;
      }
      setNotice('Account created. Check your email to confirm, then sign in.');
      setBusy(false);
      return;
    }

    // 2. Account exists and is confirmed: sign straight in.
    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(humanizeAuthError(signInError.message));
      setBusy(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthShell title="Create your account" subtitle="One step. Your career profile comes later, when it matters.">
      <form onSubmit={submit} className="auth-form" noValidate>
        {error ? <div className="auth-error" role="alert">{error}</div> : null}
        {notice ? (
          <div className="auth-success" role="status">
            {notice}
          </div>
        ) : null}
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
              autoComplete="new-password"
              minLength={8}
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
          <span className="hint">At least 8 characters.</span>
        </label>
        <button type="submit" className="btn btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-foot">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
      <p className="auth-foot legal">
        By continuing you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </AuthShell>
  );
}
