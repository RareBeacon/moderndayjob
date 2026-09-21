'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';
import { GoogleButton } from '@/components/site/GoogleButton';
import { LinkedInButton } from '@/components/site/LinkedInButton';
import { humanizeAuthError } from '@/lib/auth-messages';

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
  const [notice, setNotice] = useState('');

  const hasLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

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
      // Fallback: classic client-side signup (covers the unlikely case
      // of the server route being unavailable). The server-side field
      // checks above already ran, so only provider errors remain.
      const { data, error: fallbackError } = await supabaseBrowser().auth.signUp({
        email,
        password,
      });
      if (fallbackError) {
        setError(humanizeAuthError(fallbackError.message));
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

    // 2. The account was created unconfirmed: go straight to the code
    //    screen (the code is already in the inbox). Signing in now would
    //    fail with "email not confirmed" - that was the old bug.
    const out = (await res.json().catch(() => ({}))) as { mustVerify?: boolean };
    if (out.mustVerify) {
      router.replace(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      return;
    }

    // 3. Defensive: if a confirmed account ever comes back, sign in; an
    //    unconfirmed one still routes to the code screen.
    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (signInError) {
      if (signInError.code === 'email_not_confirmed' || /email not confirmed/i.test(signInError.message)) {
        router.replace(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        return;
      }
      setError(humanizeAuthError(signInError.message));
      setBusy(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
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
        {notice ? (
          <div className="auth-success" role="status">
            {notice}
          </div>
        ) : null}
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
