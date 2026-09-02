'use client';
import { useState } from 'react';

/** Add an encrypted per-user provider key. Logic identical to the original
 *  form, restyled only (labels, grid, admin tokens). */
export default function CredentialForm() {
  const [userId, setUserId] = useState('');
  const [provider, setProvider] = useState<'openrouter' | 'huggingface'>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('openai/gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [message, setMessage] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch('/api/admin/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, provider, apiKey, model, baseUrl }),
    });
    const j = await r.json();
    setMessage(j.ok ? 'Saved encrypted credential.' : (j.error ?? 'Failed'));
    setApiKey('');
  }

  return (
    <form onSubmit={save} className="ad-form" aria-label="Add encrypted credential">
      <div>
        <label htmlFor="cf-user">User UUID</label>
        <input id="cf-user" placeholder="00000000-0000-0000-0000-000000000000" value={userId} onChange={(e) => setUserId(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="cf-provider">Provider</label>
        <select
          id="cf-provider"
          value={provider}
          onChange={(e) => {
            const p = e.target.value as 'openrouter' | 'huggingface';
            setProvider(p);
            setBaseUrl(p === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://router.huggingface.co/v1');
          }}
        >
          <option value="openrouter">OpenRouter</option>
          <option value="huggingface">Hugging Face</option>
        </select>
      </div>
      <div>
        <label htmlFor="cf-key">API key</label>
        <input id="cf-key" placeholder="sk-…" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="cf-model">Model</label>
        <input id="cf-model" placeholder="openai/gpt-4o-mini" value={model} onChange={(e) => setModel(e.target.value)} required />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="cf-base">Base URL</label>
        <input id="cf-base" placeholder="https://openrouter.ai/api/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="btn">Save encrypted key</button>
        {message && <span className="muted" style={{ fontSize: 13.5 }} role="status">{message}</span>}
      </div>
    </form>
  );
}
