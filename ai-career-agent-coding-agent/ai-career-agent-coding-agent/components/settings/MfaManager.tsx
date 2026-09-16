'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Two-factor authentication manager (Settings -> Security).
 * All factor state comes from Supabase (the auth provider):
 *  - enroll: mfa.enroll (TOTP) -> QR + manual key -> challenge -> verify
 *  - disable: proof of possession (a fresh valid code) before unenroll
 * The TOTP secret is shown once, on demand, and never logged or sent
 * anywhere except the Supabase enrollment call.
 */

type Factor = { id: string; friendly_name?: string | null; status: string };

export function MfaManager() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const factorRef = useRef<{ id: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error: listError } = await supabaseBrowser().auth.mfa.listFactors();
      if (!listError) {
        const verified = (data?.all ?? []).some((f) => f.status === 'verified');
        setEnabled(verified);
      }
    } catch {
      // leave disabled-looking; the server re-checks anyway
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEnroll = useCallback(async () => {
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const { data, error: enrollError } = await supabaseBrowser().auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Jobiest authenticator',
      });
      if (enrollError || !data) {
        setError(enrollError?.message ?? 'Could not start setup. Please try again.');
        return;
      }
      factorRef.current = { id: data.id };
      setSecret(data.totp?.secret ?? '');
      const uri = data.totp?.uri ?? '';
      const url = await QRCode.toDataURL(uri, { width: 480, margin: 1, color: { dark: '#111C35', light: '#FFFFFF' } });
      setQrDataUrl(url);
      setWizard(true);
    } catch {
      setError('Could not start setup. Please try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const confirmEnroll = useCallback(async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    const factor = factorRef.current;
    if (!factor) {
      setError('Setup expired. Start again.');
      setWizard(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: challenge, error: challengeError } = await supabaseBrowser().auth.mfa.challenge({ factorId: factor.id });
      if (challengeError || !challenge) {
        setError(challengeError?.message ?? 'Could not verify. Please try again.');
        return;
      }
      const { error: verifyError } = await supabaseBrowser().auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) {
        setError(verifyError.message.toLowerCase().includes('invalid')
          ? 'That code is not right. Check your authenticator app and try again.'
          : verifyError.message);
        return;
      }
      setEnabled(true);
      setWizard(false);
      setDone(true);
      setCode('');
      void fetch('/api/auth/mfa/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'enabled' }),
      }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [code]);

  const disable = useCallback(async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter a current 6-digit code from your authenticator app to confirm.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: factors } = await supabaseBrowser().auth.mfa.listFactors();
      const factor = (factors?.all ?? []).find((f) => f.status === 'verified') as Factor | undefined;
      if (!factor) {
        setError('No authenticator found. Reload the page.');
        return;
      }
      // Security verification before disabling: prove possession of the
      // TOTP secret with a fresh valid code (challenge + verify), then
      // unenroll through the provider's official method.
      const { data: challenge, error: challengeError } = await supabaseBrowser().auth.mfa.challenge({ factorId: factor.id });
      if (challengeError || !challenge) {
        setError('Could not verify your code. Please try again.');
        return;
      }
      const { error: verifyError } = await supabaseBrowser().auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) {
        setError('That code is not right. Two-factor stays enabled.');
        return;
      }
      const { error: unenrollError } = await supabaseBrowser().auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) {
        setError(unenrollError.message);
        return;
      }
      setEnabled(false);
      setCode('');
      setDone(false);
      void fetch('/api/auth/mfa/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'disabled' }),
      }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [code]);

  if (loading) {
    return <p className="muted">Loading security settings…</p>;
  }

  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <div>
          <strong>Two-factor authentication</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
            Add an extra layer of security to your Jobiest account.
          </p>
        </div>
        <span className={`mfa-badge ${enabled ? 'on' : ''}`}>{enabled ? 'ON' : 'OFF'}</span>
      </div>

      {done && (
        <div className="auth-success" role="status" style={{ marginTop: 12 }}>
          Two-factor authentication enabled. Your Jobiest account is now protected with two-factor authentication.
        </div>
      )}
      {error ? (
        <div className="auth-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {!wizard && !enabled && (
        <div style={{ marginTop: 14 }}>
          <p className="muted" style={{ fontSize: 14, margin: '0 0 12px' }}>
            Use an authenticator app such as Google Authenticator to generate a temporary verification code when you sign in.
          </p>
          <button type="button" className="btn" onClick={startEnroll} disabled={busy}>
            {busy ? 'Starting…' : 'Set up two-factor authentication'}
          </button>
        </div>
      )}

      {!wizard && enabled && (
        <div style={{ marginTop: 14 }}>
          <p className="muted" style={{ fontSize: 14, margin: '0 0 8px' }}>
            Authenticator app is active. To turn it off, enter a current code from the app.
          </p>
          <label className="field" style={{ maxWidth: 220 }}>
            <span>Authenticator code</span>
            <input
              className="verify-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
          </label>
          <button type="button" className="btn-ghost" onClick={disable} disabled={busy} style={{ marginTop: 10 }}>
            {busy ? 'Checking…' : 'Disable two-factor authentication'}
          </button>
        </div>
      )}

      {wizard && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: '0 0 14px' }}>
            Protect your Jobiest account with an authenticator app. You will use an authenticator app such as Google
            Authenticator to generate a temporary verification code when you sign in.
          </p>
          <div style={{ display: 'grid', placeItems: 'center', padding: '16px', border: '1px solid var(--line)', borderRadius: 12, background: '#fff' }}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Two-factor setup QR code" width={220} height={220} style={{ width: 220, height: 220, maxWidth: '100%' }} />
            ) : (
              <p className="muted">Generating QR code…</p>
            )}
          </div>
          <p className="muted" style={{ fontSize: 13.5, margin: '12px 0 6px' }}>Scan this QR code with Google Authenticator.</p>
          <p style={{ margin: '0 0 12px' }}>
            <a
              href="https://support.google.com/accounts/answer/1066447"
              target="_blank"
              rel="noreferrer noopener"
              className="text-link"
            >
              Open Google Authenticator help
            </a>
          </p>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Can&apos;t scan?{' '}
            <button type="button" className="btn-ghost" onClick={() => setShowSecret((v) => !v)} style={{ padding: '2px 8px' }}>
              {showSecret ? 'Hide setup key' : 'Show setup key'}
            </button>
          </p>
          {showSecret && (
            <div className="settings-secret" aria-label="Manual setup key">
              {secret}
            </div>
          )}
          <label className="field" style={{ maxWidth: 220, marginTop: 14 }}>
            <span>Enter the 6-digit code from your authenticator app</span>
            <input
              className="verify-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
            />
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={confirmEnroll} disabled={busy}>
              {busy ? 'Verifying…' : 'Verify and enable'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setWizard(false);
                setCode('');
                setShowSecret(false);
                setSecret('');
                setError('');
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
