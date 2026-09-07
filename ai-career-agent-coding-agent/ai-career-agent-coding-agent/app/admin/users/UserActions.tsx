'use client';

import { useState } from 'react';

/** Per-row account controls: Suspend (reversible via DB), Terminate
 *  (permanent), and Sign out everywhere (revoke live sessions). All go
 *  through the audited server-side endpoints only. */
export default function UserActions({ userId, status }: { userId: string; status: string | null }) {
  const [busy, setBusy] = useState<'SUSPEND' | 'TERMINATE' | 'SIGNOUT' | null>(null);
  const [message, setMessage] = useState('');

  async function act(action: 'SUSPEND' | 'TERMINATE' | 'SIGNOUT') {
    if (busy) return;
    if (action === 'TERMINATE' && !window.confirm('Terminate this account permanently? This cannot be undone.')) return;
    setBusy(action);
    setMessage('');
    try {
      const r = await fetch(`/api/admin/users/${action.toLowerCase()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const j = await r.json();
      setMessage(j.ok ? (action === 'SUSPEND' ? 'Suspended.' : action === 'TERMINATE' ? 'Terminated.' : 'Sessions revoked.') : (j.error ?? 'Failed'));
      if (j.ok) setTimeout(() => window.location.reload(), 700);
    } catch {
      setMessage('Network error.');
    } finally {
      setBusy(null);
    }
  }

  const isActive = String(status).toLowerCase() === 'active';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {isActive && (
        <button
          className="btn-ghost"
          style={{ minHeight: 34, padding: '6px 12px', fontSize: 12.5 }}
          disabled={busy !== null}
          onClick={() => act('SUSPEND')}
        >
          {busy === 'SUSPEND' ? '…' : 'Suspend'}
        </button>
      )}
      <button
        className="btn-ghost"
        style={{ minHeight: 34, padding: '6px 12px', fontSize: 12.5 }}
        disabled={busy !== null}
        onClick={() => act('SIGNOUT')}
      >
        {busy === 'SIGNOUT' ? '…' : 'Sign out'}
      </button>
      <button
        className="btn-ghost"
        style={{ minHeight: 34, padding: '6px 12px', fontSize: 12.5, color: 'var(--danger)' }}
        disabled={busy !== null}
        onClick={() => act('TERMINATE')}
      >
        {busy === 'TERMINATE' ? '…' : 'Terminate'}
      </button>
      {message && <span className="muted" style={{ fontSize: 12 }} role="status">{message}</span>}
    </span>
  );
}
