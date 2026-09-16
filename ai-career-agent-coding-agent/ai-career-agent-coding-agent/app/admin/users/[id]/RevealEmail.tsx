'use client';

import { useState } from 'react';

/**
 * PII reveal for the admin user-detail page (B-063): password re-auth via
 * /api/admin/users/reveal, then a reveal-tokened fetch of the detail data.
 * The server audits the reveal fail-closed; this component only drives UX.
 */
export default function RevealEmail({ userId }: { userId: string }) {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/users/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        setError(r.status === 401 ? 'Password did not match. Nothing was revealed.' : 'Reveal failed.');
        return;
      }
      const { revealToken } = (await r.json()) as { revealToken: string };
      const d = await fetch(`/api/admin/users/${userId}?reveal=${encodeURIComponent(revealToken)}`);
      if (!d.ok) {
        setError('Detail fetch failed.');
        return;
      }
      const detail = (await d.json()) as { user: { email: string | null } };
      setEmail(detail.user.email ?? '(no email on file)');
    } finally {
      setBusy(false);
    }
  }

  if (email) {
    return <span className="ad-mono">{email}</span>;
  }

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ opacity: 0.6 }}>hidden</span>
      <input
        type="password"
        placeholder="admin password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ border: '1px solid #d8d3c8', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}
        aria-label="Admin password for PII reveal"
      />
      <button
        type="button"
        onClick={reveal}
        disabled={busy || password.length === 0}
        style={{ border: '1px solid #123f2f', background: '#123f2f', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
      >
        {busy ? 'Verifying…' : 'Reveal email'}
      </button>
      {error && <span style={{ color: '#a33' }}>{error}</span>}
    </span>
  );
}
