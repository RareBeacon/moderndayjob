'use client';

import { useState } from 'react';

/** Per-row Revoke / Rotate actions for stored AI credentials.
 *  Revoke marks a key REVOKED. Rotate prompts for a replacement key and
 *  issues a new key_version while revoking the old one (server-side audit). */
export default function CredentialActions({ id }: { id: string }) {
  const [busy, setBusy] = useState<'REVOKE' | 'ROTATE' | null>(null);
  const [message, setMessage] = useState('');

  async function act(action: 'REVOKE' | 'ROTATE') {
    if (busy) return;
    setMessage('');
    let apiKey: string | undefined;
    if (action === 'ROTATE') {
      apiKey = window.prompt('Enter the new API key to rotate to:') ?? '';
      if (!apiKey) return;
    }
    setBusy(action);
    try {
      const r = await fetch('/api/admin/credentials', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action, apiKey }),
      });
      const j = await r.json();
      setMessage(j.ok ? (action === 'REVOKE' ? 'Revoked.' : `Rotated → v${j.key_version}.`) : (j.error ?? 'Failed'));
      if (j.ok) setTimeout(() => window.location.reload(), 700);
    } catch {
      setMessage('Network error.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        className="btn-ghost"
        style={{ minHeight: 34, padding: '6px 12px', fontSize: 12.5 }}
        disabled={busy !== null}
        onClick={() => act('REVOKE')}
      >
        {busy === 'REVOKE' ? '…' : 'Revoke'}
      </button>
      <button
        className="btn"
        style={{ minHeight: 34, padding: '6px 12px', fontSize: 12.5 }}
        disabled={busy !== null}
        onClick={() => act('ROTATE')}
      >
        {busy === 'ROTATE' ? '…' : 'Rotate'}
      </button>
      {message && <span className="muted" style={{ fontSize: 12 }} role="status">{message}</span>}
    </span>
  );
}
