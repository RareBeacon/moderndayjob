'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const reduce = useReducedMotion(); // F1: https://motion.dev/docs/react-animate-presence https://motion.dev/docs/react-gestures
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
  const linkCode = useRef<string | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const qEmail = params.get('email');
      const qCode = params.get('code');
      if (qEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(qEmail)) {
        setEmail(qEmail);
        setPasswordMode(true);
        setChecked(true);
        if (qCode && /^\d{6}$/.test(qCode)) {
          linkCode.current = qCode;
          setCode(qCode);
          setNotice('Verifying the code from your link…');
        } else if (params.get('delivery') === 'failed') {
          setError('Your account was created, but we could not send the code yet. Choose Send a new code below.');
        } else {
          setNotice('');
        }
        return;
      }
      try {
        let providers: string[] = [];
        try {
          const { data: sessionData } = await supabaseBrowser().auth.getSession();
          providers = sessionData?.session?.user?.app_metadata?.providers ?? [];
        } catch {}
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
    timer.current = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const confirm = useCallback(async () => {
    if (busy || !/^\d{6}$/.test(code)) {
      if (!/^\d{6}$/.test(code)) setError("That code didn't match. Try again or resend.");
      return;
    }
    setBusy(true);
    setError('');
    try {
      const gate =
        !passwordMode && window.sessionStorage.getItem('jobiest.oauthGate') === 'linkedin'
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
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; needsAccountCompletion?: boolean };
      if (res.ok && out.ok) {
        if (passwordMode) {
          setNotice('Your email is verified. Taking you to sign in…');
          router.replace(`/login?email=${encodeURIComponent(email)}&verified=1`);
        } else {
          try { await fetch('/api/auth/session', { method: 'POST' }); } catch {}
          const rawNext = new URLSearchParams(window.location.search).get('next');
          const safeNext = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('://') ? rawNext : null;
          if (out.needsAccountCompletion) {
            router.replace(safeNext ? `/complete-account?next=${encodeURIComponent(safeNext)}` : '/complete-account');
          } else {
            router.replace(safeNext || '/dashboard');
            router.refresh();
          }
        }
        return;
      }
      setError(out.message ?? "That code didn't match. Try again or resend.");
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, code, router, email, passwordMode]);

  useEffect(() => {
    if (passwordMode && checked && linkCode.current === code && /^\d{6}$/.test(code) && !autoSubmitted) {
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
        !passwordMode && window.sessionStorage.getItem('jobiest.oauthGate') === 'linkedin'
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
        setNotice(out.message ?? 'Check your inbox for a new code. It expires in 10 minutes.');
        setCode('');
        setError('');
        setCooldown(60);
        inputsRef.current[0]?.focus();
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

  const handleBoxChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = code.split('');
    while (next.length < 6) next.push('');
    if (digit) {
      next[index] = digit;
      setCode(next.join('').slice(0, 6));
      setError('');
      if (index < 5) inputsRef.current[index + 1]?.focus();
    } else {
      next[index] = '';
      setCode(next.join('').slice(0, 6));
      setError('');
    }
  };

  const handleBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const next = code.split('');
      while (next.length < 6) next.push('');
      next[index - 1] = '';
      setCode(next.join('').slice(0, 6));
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      e.preventDefault();
      setCode(pasted);
      setError('');
      const focusIndex = Math.min(pasted.length, 5);
      inputsRef.current[focusIndex]?.focus();
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '40px 20px',
        backgroundColor: '#f9fafb',
        backgroundImage:
          'repeating-linear-gradient(115deg, transparent 0 18px, rgba(15,23,42,0.04) 18px 19px)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: '#0f172a',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '-0.02em',
            }}
          >
            J
          </span>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.14em', color: '#0f172a' }}>JOBIEST</span>
        </Link>

        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#111827', margin: '0 0 10px' }}>
          Check your email
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: '0 0 28px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
          We sent a 6-digit code to <strong style={{ color: '#111827', fontWeight: 600 }}>{email || 'your email'}</strong>. It expires in 10 minutes.
        </p>

        <AnimatePresence>
          {notice && !error ? (
            <motion.div className="auth-success"
              role="status"
              initial={reduce ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 13,
                marginBottom: 16,
                textAlign: 'center',
              }}
            >
              {notice}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
          noValidate
          style={{ display: 'grid', gap: 14 }}
        >
          {/* 6-box OTP */}
          <div
            onPaste={handlePaste}
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                whileFocus={reduce ? {} : { scale: 1.04 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={code[i] ?? ''}
                onChange={(e) => handleBoxChange(i, e.target.value)}
                onKeyDown={(e) => handleBoxKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                disabled={!checked || busy}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 10,
                  border: error ? '1.5px solid #ef4444' : '1.5px solid #d1d5db',
                  background: '#fff',
                  textAlign: 'center',
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#111827',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {error ? (
              <motion.p className="auth-error" role="alert" style={{ color: '#ef4444', fontSize: 13, margin: 0 }} initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} key="verify-error">
                {error}
              </motion.p>
            ) : (
              <motion.p style={{ height: 18, margin: 0 }} key="verify-spacer" initial={false} />
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={busy || !checked || code.length !== 6}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 14,
              border: 0,
              background: busy || code.length !== 6 ? '#aab3c1' : '#d7f94b',
              color: busy || code.length !== 6 ? '#fff' : '#111d35',
              fontWeight: 650,
              fontSize: 15,
              cursor: busy || code.length !== 6 ? 'not-allowed' : 'pointer',
              transition: 'background 150ms ease',
              boxShadow: '0 1px 2px rgb(17 29 53 / 8%)',
            }}
          >
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>
        </form>

        <button
          type="button"
          onClick={switchAccount}
          disabled={busy}
          style={{
            background: 'transparent',
            border: 0,
            color: '#6b7280',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            marginTop: 14,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Wrong email? Use a different address
        </button>

        <div style={{ marginTop: 22 }}>
          <button
            type="button"
            onClick={resend}
            disabled={busy || cooldown > 0}
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 999,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 500,
              color: cooldown > 0 ? '#9ca3af' : '#374151',
              cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 28 }}>
          Code expires in 10 minutes • Check spam folder
        </p>
      </div>
    </main>
  );
}
