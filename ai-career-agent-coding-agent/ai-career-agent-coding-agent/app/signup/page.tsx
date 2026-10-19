'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/site/AuthShell';
import { GoogleButton } from '@/components/site/GoogleButton';
import { LinkedInButton } from '@/components/site/LinkedInButton';

const COUNTRY_CODES = [
  { code: '+234', label: '🇳🇬 +234' },
  { code: '+233', label: '🇬🇭 +233' },
  { code: '+254', label: '🇰🇪 +254' },
  { code: '+27', label: '🇿🇦 +27' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+1', label: '🇺🇸 +1' },
];

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+234'); // Nigeria by default
  const [localPhone, setLocalPhone] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const name = fullName.trim().replace(/\s+/g, ' ');
    const digits = localPhone.replace(/\D/g, '');
    if (name.length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (digits.length < 7 || digits.length > 12) {
      setError('Please enter your phone number without the country code, e.g. 801 234 5678.');
      return;
    }
    if (!hasLength || !hasNumber || !hasSpecial) {
      setError('Your password needs at least 8 characters, including a number and a special character.');
      return;
    }
    setBusy(true);
    const phone = `${countryCode}${digits}`;

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
      body: JSON.stringify({ email, password, fullName: name, phone, attribution }),
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
    <AuthShell title="Create your account" subtitle="One step. Your career profile comes later, when it matters.">
      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        <LinkedInButton />
        <GoogleButton />
      </div>
      <div className="auth-divider" style={{ margin: '18px 0' }}><span>or with email</span></div>
      <form onSubmit={submit} className="auth-form" noValidate>
        {error ? <div className="auth-error" role="alert">{error}</div> : null}
        <label>
          Full name
          <input
            type="text"
            autoComplete="name"
            placeholder="e.g. Adaeze Okafor"
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Phone number
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              aria-label="Country code"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              style={{ flex: 'none', width: 110 }}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="801 234 5678"
              value={localPhone}
              onChange={(e) => setLocalPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 14))}
              required
            />
          </div>
          <span className="hint">We only use this if we need to reach you about your account.</span>
        </label>
        <label>
          Password
          <div className="control">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
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
          <ul className="password-rules" aria-live="polite">
            <li className={hasLength ? 'rule-ok' : ''}>{hasLength ? '✓' : '•'} At least 8 characters</li>
            <li className={hasNumber ? 'rule-ok' : ''}>{hasNumber ? '✓' : '•'} At least one number</li>
            <li className={hasSpecial ? 'rule-ok' : ''}>{hasSpecial ? '✓' : '•'} At least one special character</li>
          </ul>
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
