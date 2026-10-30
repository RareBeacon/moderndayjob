'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';
import { GoogleButton } from '@/components/site/GoogleButton';
import { LinkedInButton } from '@/components/site/LinkedInButton';
import { humanizeAuthError } from '@/lib/auth-messages';

function LoginInner() {
  const reduce = useReducedMotion();
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
  const expired = params.get('expired') === '1';
  const oauthError = params.get('error');
  const oauthErrorMessage =
    oauthError === 'oauth_cancelled'
      ? 'Sign-in was cancelled. You can try again whenever you are ready.'
      : oauthError === 'oauth_retry' || oauthError === 'flow_state_already_used'
      ? 'Your previous sign-in link expired. Please try again.'
      : oauthError === 'session_expired' || expired
      ? 'Your session expired for your security. Please sign in again.'
      : oauthError === 'oauth_failed'
      ? 'Social sign-in could not finish. Please try again or use email and password.'
      : null;

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
    // Create app session (30m idle / 7d absolute, session-only cookie) - required for protected pages including /mfa-verify
    try {
      await fetch('/api/auth/session', { method: 'POST' });
    } catch {}
    // MFA is part of the real login flow: if the user has an enrolled
    // authenticator, the session stays aal1 until the code is verified.
    const rawNext = new URLSearchParams(window.location.search).get('next');
    const safeNext = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('://') ? rawNext : null;
    try {
      const { data: aal } = await supabaseBrowser().auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        router.push(safeNext ? `/mfa-verify?next=${encodeURIComponent(safeNext)}` : '/mfa-verify');
        return;
      }
    } catch {
      // fall through to the dashboard; middleware re-checks
    }
    router.push(safeNext || '/dashboard');
    router.refresh();
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your Jobiest workspace.">
      <AnimatePresence>
        {verified ? (
          <motion.div className="auth-success" role="status" style={{ marginTop: 16 }} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            Your email is verified. Enter your password to continue.
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {oauthErrorMessage ? (
          <motion.div className="auth-error" role="alert" style={{ marginTop: 16 }} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {oauthErrorMessage}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        <LinkedInButton />
        <GoogleButton />
      </div>
      <div className="auth-divider" style={{ margin: '18px 0' }}><span>or with email</span></div>
      <form onSubmit={submit} className="auth-form" noValidate>
        <AnimatePresence>{error ? <motion.div className="auth-error" role="alert" initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>{error}</motion.div> : null}</AnimatePresence>
        <motion.label whileFocus={reduce ? {} : { scale: 1.01 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </motion.label>
        <motion.label whileFocus={reduce ? {} : { scale: 1.01 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <Link href="/forgot-password" className="inline-link" style={{ fontSize: 13 }}>
              Forgot password?
            </Link>
          </div>
        </motion.label>
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
