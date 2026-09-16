'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';

interface Credential {
  id: string;
  provider: string;
  model: string;
  host: string;
  status: string;
  key_version: number;
  created_at: string;
}

/**
 * User-managed AI providers (Phase 7). Users bring their own
 * OpenAI-compatible endpoint; keys are encrypted at rest, never displayed
 * again after saving, and base URLs must be public https endpoints.
 */
export default function AiCredentialsPage() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({ provider: '', model: '', base_url: '', api_key: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/credentials');
      const out = await res.json();
      setCreds(out.credentials ?? []);
    } catch {
      setMessage({ kind: 'err', text: 'Could not load credentials.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const out = await res.json();
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Saved. Jobiest will use this provider for your AI features.' });
        setForm({ provider: '', model: '', base_url: '', api_key: '' });
        await load();
      } else {
        const detail = out.error === 'BASE_URL_BLOCKED'
          ? 'That endpoint is not allowed. Use a public https address (for example https://api.groq.com/openai/v1).'
          : out.issues?.[0] ?? out.detail ?? out.error ?? 'Could not save the credential.';
        setMessage({ kind: 'err', text: String(detail) });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/credentials?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Credential removed.' });
        await load();
      } else {
        setMessage({ kind: 'err', text: 'Could not remove the credential.' });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const active = creds.filter((c) => c.status === 'ACTIVE');

  return (
    <AppShell active="profile" title="AI providers">
      <section className="workspace-hero">
        <p className="eyebrow">SETTINGS</p>
        <h1>AI providers</h1>
        <p>
          Bring your own OpenAI-compatible endpoint and Jobiest uses it for your AI features.
          Keys are encrypted at rest and never shown again after saving. Public https endpoints only.
        </p>
      </section>

      {message && (
        <p className={`context-note ${message.kind === 'ok' ? 'success' : ''}`} role="status" style={{ borderColor: message.kind === 'ok' ? 'var(--success-line)' : 'var(--warning-line)' }}>
          {message.text}
        </p>
      )}

      <form onSubmit={add} className="settings-form" style={{ display: 'grid', gap: 14, maxWidth: 560 }}>
        <label className="field">
          <span>Provider name</span>
          <input
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            placeholder="groq"
            required
            maxLength={40}
            pattern="[a-zA-Z0-9._-]+"
          />
        </label>
        <label className="field">
          <span>Model</span>
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="llama-3.3-70b-versatile"
            required
            maxLength={120}
          />
        </label>
        <label className="field">
          <span>Base URL (public https)</span>
          <input
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            placeholder="https://api.groq.com/openai/v1"
            required
            maxLength={300}
            type="url"
          />
        </label>
        <label className="field">
          <span>API key</span>
          <input
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            placeholder="gsk_..."
            required
            minLength={8}
            maxLength={400}
            type="password"
            autoComplete="off"
          />
        </label>
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save provider'}
          </button>
        </div>
      </form>

      <h2 style={{ fontSize: 18, margin: '28px 0 12px' }}>Your providers ({active.length})</h2>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : active.length === 0 ? (
        <p className="muted">No providers yet. Jobiest falls back to its built-in generation, which needs no key.</p>
      ) : (
        <div className="document-list" style={{ display: 'grid', gap: 10 }}>
          {active.map((c) => (
            <div key={c.id} className="document-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>{c.provider}</strong>
                <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                  {c.model} · {c.host}
                </p>
              </div>
              <button className="btn-ghost" onClick={() => revoke(c.id)} disabled={busy} style={{ cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
