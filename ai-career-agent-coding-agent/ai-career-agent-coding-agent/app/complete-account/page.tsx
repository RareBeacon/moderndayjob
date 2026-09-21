'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';

const COUNTRY_CODES = [
  { code: '+234', label: '🇳🇬 +234' },
  { code: '+233', label: '🇬🇭 +233' },
  { code: '+254', label: '🇰🇪 +254' },
  { code: '+27', label: '🇿🇦 +27' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+1', label: '🇺🇸 +1' },
];

/**
 * Complete your account: the step after email verification for Google and
 * LinkedIn sign-ups (owner brief 2026-09-21). Every account ends up with the
 * same three things however it was created: a verified email, a password,
 * and a phone number. Form signups provide password + phone at registration
 * and never see this screen.
 *
 * The password is set through the user's OWN signed-in session
 * (auth.updateUser) so the session survives - the admin API path revokes
 * all sessions and used to log the user out here (2026-09-21 fix).
 */
export default function CompleteAccountPage() {
  const router = useRouter();
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
    const digits = localPhone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 12) {
      setError('Please enter your phone number without the country code, e.g. 801 234 5678.');
      return;
    }
    if (!hasLength || !hasNumber || !hasSpecial) {
      setError('Your password needs at least 8 characters, including a number and a special character.');
      return;
    }
    setBusy(true);
    try {
      // 1. Password through the signed-in session: the session stays alive.
      const { error: pwError } = await supabaseBrowser().auth.updateUser({ password });
      if (pwError) {
        setError('We could not save your password just now. Please try again.');
        return;
      }

      // 2. Phone number (and the completion marker) server-side.
      const res = await fetch('/api/auth/complete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `${countryCode}${digits}` }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (res.ok && out.ok) {
        router.replace('/dashboard');
        router.refresh();
        return;
      }
      setError(out.message ?? 'We could not save that just now. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Complete your account" subtitle="Set a password and add your phone number. This keeps your account recoverable no matter how you signed up.">
      <form onSubmit={submit} className="auth-form" noValidate>
        {error ? <div className="auth-error" role="alert">{error}</div> : null}
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
          Create a password
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
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
      <p className="auth-foot">
        This one-time step keeps your account recoverable with any sign-in method.
      </p>
    </AuthShell>
  );
}
