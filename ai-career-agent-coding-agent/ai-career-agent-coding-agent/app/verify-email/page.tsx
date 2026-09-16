'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AuthShell } from '@/components/site/AuthShell';

/**
 * Email verification gate for accounts created via Google. The server decides
 * who lands here (google provider + unverified profile); the page collects a
 * 6-digit code, sends new codes on request, and lets the user switch
 * accounts. Password accounts never see this page.
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/google/verify');
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
      const res = await fetch('/api/auth/google/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', code }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (res.ok && out.ok) {
        router.replace('/dashboard');
        router.refresh();
        return;
      }
      setError(out.message ?? 'That code did not work. Try again or send a new one.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, code, router]);

  const resend = useCallback(async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/google/verify', {
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
  }, [busy, cooldown]);

  const switchAccount = useCallback(async () => {
    await supabaseBrowser().auth.signOut().catch(() => {});
    router.replace('/login');
  }, [router]);

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
