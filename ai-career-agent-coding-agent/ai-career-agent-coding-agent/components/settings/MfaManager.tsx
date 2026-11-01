'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Two-factor authentication manager (Settings -> Security).
 *  - Enroll: mfa.enroll (TOTP) -> QR + manual key -> challenge -> verify -> issue 8 hashed single-use backup codes
 *  - Backup codes: view once at issue/regeneration, copy or download .txt; never stored in plaintext
 *  - Disable: requires fresh 6-digit TOTP proof of possession; blocked on mandatory-MFA admin/Owner accounts
 */

type Factor = { id: string; friendly_name?: string | null; status: string };

export function MfaManager() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [mandatoryMfa, setMandatoryMfa] = useState(false);
  const [unusedRecoveryCount, setUnusedRecoveryCount] = useState<number>(0);
  const [freshRecoveryCodes, setFreshRecoveryCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const factorRef = useRef<{ id: string } | null>(null);

  const loadRecoveryStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/mfa/recovery-codes');
      if (r.ok) {
        const j = await r.json();
        setUnusedRecoveryCount(Number(j.unusedCount ?? 0));
        setMandatoryMfa(Boolean(j.mandatoryMfa));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const { data, error: listError } = await supabaseBrowser().auth.mfa.listFactors();
      if (!listError) {
        const verified = (data?.all ?? []).some((f) => f.status === 'verified');
        setEnabled(verified);
      }
      await loadRecoveryStatus();
    } catch {
      // leave disabled-looking; the server re-checks anyway
    } finally {
      setLoading(false);
    }
  }, [loadRecoveryStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const issueBackupCodes = useCallback(async () => {
    setBusy(true);
    setError('');
    setCopiedCodes(false);
    try {
      const r = await fetch('/api/auth/mfa/recovery-codes', { method: 'POST' });
      const j = await r.json();
      if (r.ok && Array.isArray(j.codes)) {
        setFreshRecoveryCodes(j.codes);
        setUnusedRecoveryCount(j.codes.length);
      } else {
        setError(j.message ?? 'Could not generate backup recovery codes right now.');
      }
    } catch {
      setError('Could not generate backup recovery codes right now.');
    } finally {
      setBusy(false);
    }
  }, []);

  const startEnroll = useCallback(async () => {
    setBusy(true);
    setError('');
    setDone(false);
    setFreshRecoveryCodes(null);
    try {
      try {
        const { data: existing } = await supabaseBrowser().auth.mfa.listFactors();
        const unverified = (existing?.all ?? []).filter((f) => f.status !== 'verified');
        for (const stale of unverified) {
          await supabaseBrowser().auth.mfa.unenroll({ factorId: stale.id }).catch(() => {});
        }
      } catch {
        // non-fatal; proceed to enroll
      }

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
        setError(
          verifyError.message.toLowerCase().includes('invalid')
            ? 'That code is not right. Check your authenticator app and try again.'
            : verifyError.message,
        );
        return;
      }
      setEnabled(true);
      setWizard(false);
      setDone(true);
      setCode('');
      setSecret('');
      void fetch('/api/auth/mfa/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'enabled' }),
      }).catch(() => {});

      try {
        const r = await fetch('/api/auth/mfa/recovery-codes', { method: 'POST' });
        const j = await r.json();
        if (r.ok && Array.isArray(j.codes)) {
          setFreshRecoveryCodes(j.codes);
          setUnusedRecoveryCount(j.codes.length);
        }
      } catch {
        /* user can still click Generate backup codes manually */
      }
    } finally {
      setBusy(false);
    }
  }, [code]);

  const disable = useCallback(async () => {
    if (mandatoryMfa) {
      setError('Two-factor authentication is mandatory on administrative accounts and cannot be disabled.');
      return;
    }
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
      setFreshRecoveryCodes(null);
      setUnusedRecoveryCount(0);
      void fetch('/api/auth/mfa/recovery-codes', { method: 'DELETE' }).catch(() => {});
      void fetch('/api/auth/mfa/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'disabled' }),
      }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [code, mandatoryMfa]);

  const copyBackupCodes = useCallback(async () => {
    if (!freshRecoveryCodes) return;
    try {
      await navigator.clipboard.writeText(freshRecoveryCodes.join('\n'));
      setCopiedCodes(true);
    } catch {
      /* ignore */
    }
  }, [freshRecoveryCodes]);

  const downloadBackupCodes = useCallback(() => {
    if (!freshRecoveryCodes) return;
    const text = [
      'Jobiest Two-Factor Authentication Backup Recovery Codes',
      `Generated: ${new Date().toISOString()}`,
      'Each code can be used ONCE if you lose access to your authenticator app.',
      'Store these codes in a password manager or secure offline vault.',
      '',
      ...freshRecoveryCodes,
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jobiest-mfa-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [freshRecoveryCodes]);

  if (loading) {
    return <p className="muted">Loading security settings…</p>;
  }

  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <div>
          <strong>Two-factor authentication</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
            Add an extra layer of security to your Jobiest account with an authenticator app (TOTP) and single-use backup codes.
          </p>
        </div>
        <span className={`mfa-badge ${enabled ? 'on' : ''}`}>{enabled ? 'ON' : 'OFF'}</span>
      </div>

      {done && (
        <div className="auth-success" role="status" style={{ marginTop: 12 }}>
          Two-factor authentication enabled. Save your single-use backup recovery codes below in a safe place.
        </div>
      )}
      {error ? (
        <div className="auth-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {freshRecoveryCodes && freshRecoveryCodes.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 10,
            border: '1px solid rgba(15,23,42,0.16)',
            background: 'rgba(15,23,42,0.03)',
          }}
        >
          <strong style={{ fontSize: 14 }}>Save your single-use backup recovery codes now</strong>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
            These codes are shown only once and stored as salted hashes. Each code works once if you lose your phone.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 8,
              fontFamily: 'monospace',
              fontSize: 13.5,
              marginBottom: 12,
            }}
          >
            {freshRecoveryCodes.map((c) => (
              <div
                key={c}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: '#fff',
                  border: '1px solid rgba(15,23,42,0.1)',
                }}
              >
                {c}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost" onClick={copyBackupCodes}>
              {copiedCodes ? 'Copied!' : 'Copy codes'}
            </button>
            <button type="button" className="btn-ghost" onClick={downloadBackupCodes}>
              Download .txt
            </button>
            <button type="button" className="btn-ghost" onClick={() => setFreshRecoveryCodes(null)}>
              I have saved them
            </button>
          </div>
        </div>
      )}

      {!wizard && !enabled && (
        <div style={{ marginTop: 14 }}>
          {mandatoryMfa && (
            <p style={{ fontSize: 13.5, fontWeight: 600, margin: '0 0 8px' }}>
              Administrative account notice: Two-factor authentication is mandatory for your role.
            </p>
          )}
          <p className="muted" style={{ fontSize: 14, margin: '0 0 12px' }}>
            Use Google Authenticator, Authy, 1Password, or Apple Passwords to generate a 6-digit verification code when signing in.
          </p>
          <button type="button" className="btn" onClick={startEnroll} disabled={busy}>
            {busy ? 'Starting…' : 'Set up two-factor authentication'}
          </button>
        </div>
      )}

      {!wizard && enabled && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
              Unused backup recovery codes remaining: <b>{unusedRecoveryCount}</b>
            </p>
            <button type="button" className="btn-ghost" onClick={issueBackupCodes} disabled={busy} style={{ minHeight: 34, fontSize: 13 }}>
              {unusedRecoveryCount > 0 ? 'Regenerate backup codes' : 'Generate backup codes'}
            </button>
          </div>

          {mandatoryMfa ? (
            <p className="muted" style={{ fontSize: 13.5 }}>
              Two-factor authentication is mandatory on Owner and Admin accounts and stays active permanently.
            </p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 14, margin: '0 0 8px' }}>
                Authenticator app is active. To turn it off, enter a current 6-digit code from your app.
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
            </>
          )}
        </div>
      )}

      {wizard && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: '0 0 14px' }}>
            Protect your Jobiest account with an authenticator app. Scan the QR code below or enter the setup key manually.
          </p>
          <div style={{ display: 'grid', placeItems: 'center', padding: '16px', border: '1px solid var(--line)', borderRadius: 12, background: '#fff' }}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Two-factor setup QR code" width={220} height={220} style={{ width: 220, height: 220, maxWidth: '100%' }} />
            ) : (
              <p className="muted">Generating QR code…</p>
            )}
          </div>
          <p className="muted" style={{ fontSize: 13.5, margin: '12px 0 6px' }}>Scan this QR code with Google Authenticator or any TOTP app.</p>
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
