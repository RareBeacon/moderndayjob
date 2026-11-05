'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/site/AuthShell';
import { GoogleButton } from '@/components/site/GoogleButton';
import { LinkedInButton } from '@/components/site/LinkedInButton';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('error');
    const provider = params.get('provider') === 'linkedin' ? 'LinkedIn' : 'Google';
    if (!code) {
      setOauthNotice(null);
    } else if (code === 'oauth_cancelled') {
      setOauthNotice('Sign-in was cancelled. You can try again whenever you are ready.');
    } else if (code === 'provider_disabled') {
      setOauthNotice(`${provider} sign-in is not enabled right now. Please sign up with email and password below.`);
    } else if (code === 'oauth_retry' || code === 'session_expired') {
      setOauthNotice('Your previous sign-in link expired. Please try again.');
    } else if (code === 'rate_limited') {
      setOauthNotice('Too many sign-in attempts just now. Please wait a minute and try again.');
    } else {
      setOauthNotice('Social sign-up could not finish. Please try again or create your account with email below.');
    }
  }, []);

  const hasLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!hasLength || !hasNumber || !hasSpecial) {
      setError('Your password needs at least 8 characters, including a number and a special character.');
      return;
    }
    if (!termsAccepted) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    setBusy(true);

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

    // 1. Create the account server-side. The account is created UNCONFIRMED
    //    and a 6-digit code is emailed; activation happens at /verify-email.
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, fullName: name, attribution }),
    }).catch(() => null);

    if (res && res.status === 409) {
      const { error: msg } = await res.json().catch(() => ({ error: '' }));
      setError(msg || 'An account with this email already exists. Sign in instead.');
      setBusy(false);
      return;
    }

    if (!res || !res.ok) {
      // Never bypass the server's unconfirmed-user, rate-limit, and email
      // verification policy with a second client-side signup path.
      const out = res ? (await res.json().catch(() => ({}))) as { error?: string } : {};
      setError(out.error || 'We could not create your account just now. Please try again.');
      setBusy(false);
      return;
    }

    // The account exists even if the email provider rejected the message.
    // Route to a recoverable resend page without claiming inbox delivery.
    const out = (await res.json().catch(() => ({}))) as { mustVerify?: boolean; verificationEmailAccepted?: boolean };
    if (out.mustVerify !== true) {
      setError('We could not confirm your account status. Please try signing in or contact support.');
      setBusy(false);
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const delivery = out.verificationEmailAccepted === false ? '&delivery=failed' : '';
    router.replace(`/verify-email?email=${encodeURIComponent(normalizedEmail)}${delivery}`);
  }

  return (
    <AuthShell
      variant="signup"
      title="Create your free account"
      subtitle="Start building stronger applications with Jobiest."
    >
      {oauthNotice ? (
        <div className="auth-error" role="alert" style={{ marginTop: 16 }}>
          {oauthNotice}
        </div>
      ) : null}
      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        <LinkedInButton />
        <GoogleButton />
      </div>
      <div className="auth-divider" style={{ margin: '18px 0' }}><span>or sign up with email</span></div>
      <form onSubmit={submit} className="auth-form" noValidate>
        {error ? <div className="auth-error" role="alert">{error}</div> : null}
        <label>
          Full name
          <input
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={80}
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
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
              placeholder="Create a password"
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
          <span className="hint">Use at least 8 characters.</span>
        </label>
        <div className="signup-consent">
          <input
            type="checkbox"
            id="terms-consent"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            required
          />
          <label htmlFor="terms-consent">
            I agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.
          </label>
        </div>
        <button
          type="submit"
          className="btn btn-block"
          disabled={busy}
          aria-label="Create account"
        >
          {busy ? 'Creating account…' : 'Create free account'}
        </button>
      </form>
      <p className="auth-foot">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
