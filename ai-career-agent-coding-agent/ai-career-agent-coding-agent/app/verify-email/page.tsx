'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';

/**
 * Email verification page. Two modes:
 *  - Password signups (no session yet): arrive with ?email=… (and, when the
 *    emailed link was used, ?code=…). Verifies through POST /api/auth/verify
 *    pre-session, then routes to /login to sign in.
 *  - Social sign-ins (session exists): the server routes unverified google
 *    and linkedin sessions here; verifies through the provider-matching
 *    /api/auth/{google,linkedin}/verify.
 * The page collects a 6-digit code, sends new codes on request, and lets the
 * user switch accounts.
 */
export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [checked, setChecked] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const qEmail = params.get('email');
      const qCode = params.get('code');

      // Password-signup mode: pre-session, verify via /api/auth/verify.
      if (qEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(qEmail)) {
        setEmail(qEmail);
        setPasswordMode(true);
        setChecked(true);
        if (qCode && /^\d{6}$/.test(qCode)) {
          setCode(qCode);
          setNotice('Verifying the code from your link…');
        } else {
          setNotice('Enter the 6-digit code we emailed you. It expires in 10 minutes.');
        }
        return;
      }

      // Social-session mode (google or linkedin): pick the gate endpoint
      // from the session's provider.
      try {
        let providers: string[] = [];
        try {
          const { data: sessionData } = await supabaseBrowser().auth.getSession();
          providers = sessionData?.session?.user?.app_metadata?.providers ?? [];
        } catch {
          /* default to the google gate */
        }
        window.sessionStorage.setItem(
          'jobiest.oauthGate',
          providers.includes('linkedin_oidc') || providers.includes('linkedin') ? 'linkedin' : 'google',
        );
        const gate = providers.includes('linkedin_oidc') || providers.includes('linkedin')
          ? '/api/auth/linkedin/verify'
          : '/api/auth/google/verify';
        const res = await fetch(gate);
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (res.ok) {
          const state = (await res.json()) as { requiresVerification?: boolean; email?: string };
          if (!state.requiresVerification) {
            router.replace('/dashboard');
            return;
          }
          setEmail(state.email ?? 'your email');
          setNotice('We sent a 6-digit code to your email. It expires in 10 minutes.');
          setCooldown(60);
        }
      } catch {
        setError('We could not check your verification status. Reload the page.');
      } finally {
        setChecked(true);
      }
    })();
  }, [router]);

  useEffect(() => {
    timer.current = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);


  const confirm = useCallback(async () => {
    if (busy || !/^\d{6}$/.test(code)) {
      if (!/^\d{6}$/.test(code)) setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const gate =
        !passwordMode &&
        window.sessionStorage.getItem('jobiest.oauthGate') === 'linkedin'
          ? '/api/auth/linkedin/verify'
          : '/api/auth/google/verify';
      const res = passwordMode
        ? await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'confirm', email, code }),
          })
        : await fetch(gate, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'confirm', code }),
          });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (res.ok && out.ok) {
        if (passwordMode) {
          setNotice('Your email is verified. Taking you to sign in…');
          router.replace('/login');
        } else {
          router.replace('/dashboard');
          router.refresh();
        }
        return;
      }
      setError(out.message ?? 'That code did not work. Try again or send a new one.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, code, router, email, passwordMode]);

  // One-click verification: when the emailed link carried a valid code, submit
  // it automatically once (password mode only).
  useEffect(() => {
    if (passwordMode && checked && /^\d{6}$/.test(code) && !autoSubmitted) {
      setAutoSubmitted(true);
      void confirm();
    }
  }, [passwordMode, checked, code, autoSubmitted, confirm]);

  const resend = useCallback(async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError('');
    try {
      const gate =
        !passwordMode &&
        window.sessionStorage.getItem('jobiest.oauthGate') === 'linkedin'
          ? '/api/auth/linkedin/verify'
          : '/api/auth/google/verify';
      const res = passwordMode
        ? await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'send', email }),
          })
        : await fetch(gate, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'send' }),
          });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (res.ok && out.ok) {
        setNotice(out.message ?? 'New code sent. It expires in 10 minutes.');
        setCode('');
        setCooldown(60);
      } else {
        setError(out.message ?? 'Could not send a new code. Try again shortly.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, cooldown, email, passwordMode]);

  const switchAccount = useCallback(async () => {
    if (!passwordMode) await supabaseBrowser().auth.signOut().catch(() => {});
    router.replace('/login');
  }, [router, passwordMode]);

  return (
    <AuthShell title="Verify your email" subtitle="One more step to finish setting up your Jobiest account.">
      {notice ? (
        <div className="auth-success" role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
        noValidate
      >
        <label>
          Code sent to {email || 'your email'}
          <input
            className="verify-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            disabled={!checked}
            autoFocus
          />
        </label>
        <button type="submit" className="btn btn-block" disabled={busy || !checked}>
          {busy ? 'Checking…' : 'Verify and continue'}
        </button>
      </form>
      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        <button type="button" className="btn-ghost btn-block" onClick={resend} disabled={busy || cooldown > 0}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </button>
        <button type="button" className="btn-ghost btn-block" onClick={switchAccount} disabled={busy}>
          Use a different account
        </button>
      </div>
    </AuthShell>
  );
}
