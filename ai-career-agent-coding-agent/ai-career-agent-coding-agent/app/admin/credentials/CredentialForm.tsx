'use client';
import { useState } from 'react';

type ProviderSlug = 'qwencloud' | 'dashscope' | 'openrouter' | 'huggingface';

const PROVIDER_DEFAULTS: Record<ProviderSlug, { baseUrl: string; model: string }> = {
  qwencloud: {
    baseUrl: 'https://maas.qwencloudapi.com/compatible-mode/v1',
    model: 'qwen3.8-max',
  },
  dashscope: {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.8-max',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  huggingface: {
    baseUrl: 'https://router.huggingface.co/v1',
    model: 'Qwen/Qwen2.5-72B-Instruct',
  },
};

interface ProbeResult {
  endpoint: string;
  catalogCount: number;
  recommended: { flagship: string; standard: string; fast: string; asr: string };
  probes: Array<{ model: string; tier: string; reachable: boolean; status: number; latencyMs: number }>;
}

/** Add an encrypted per-user provider key, or live-probe Alibaba QwenCloud /
 *  DashScope models directly from the deployed Vercel runtime. */
export default function CredentialForm() {
  const [userId, setUserId] = useState('');
  const [provider, setProvider] = useState<ProviderSlug>('qwencloud');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_DEFAULTS.qwencloud.model);
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULTS.qwencloud.baseUrl);
  const [message, setMessage] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);

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

  async function runQwenProbe() {
    if (!apiKey.trim()) {
      setMessage('Enter your QwenCloud / DashScope API key first to probe models.');
      return;
    }
    setProbing(true);
    setMessage('Probing QwenCloud & DashScope models live from server...');
    setProbeResult(null);
    try {
      const r = await fetch('/api/admin/credentials/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setMessage(j.detail || j.error || 'Model probe failed.');
        return;
      }
      setBaseUrl(j.endpoint);
      setModel(j.recommended.flagship);
      setProvider(j.endpoint.includes('qwencloudapi.com') ? 'qwencloud' : 'dashscope');
      setProbeResult(j as ProbeResult);
      setMessage(`Connected to ${j.endpoint} (${j.catalogCount} models unlocked).`);
    } catch {
      setMessage('Network error while probing models.');
    } finally {
      setProbing(false);
    }
  }

  return (
    <div>
      <form onSubmit={save} className="ad-form" aria-label="Add encrypted credential">
        <div>
          <label htmlFor="cf-user">User UUID</label>
          <input
            id="cf-user"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="cf-provider">Provider</label>
          <select
            id="cf-provider"
            value={provider}
            onChange={(e) => {
              const p = e.target.value as ProviderSlug;
              setProvider(p);
              setBaseUrl(PROVIDER_DEFAULTS[p].baseUrl);
              setModel(PROVIDER_DEFAULTS[p].model);
            }}
          >
            <option value="qwencloud">Alibaba QwenCloud (sk-ws-)</option>
            <option value="dashscope">Alibaba DashScope (sk-)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="huggingface">Hugging Face</option>
          </select>
        </div>
        <div>
          <label htmlFor="cf-key">API key</label>
          <input
            id="cf-key"
            placeholder="sk-ws-... or sk-..."
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="cf-model">Model</label>
          <input
            id="cf-model"
            placeholder="qwen3.8-max"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="cf-base">Base URL</label>
          <input
            id="cf-base"
            placeholder="https://maas.qwencloudapi.com/compatible-mode/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            required
          />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="submit" className="btn">Save encrypted key</button>
          {(provider === 'qwencloud' || provider === 'dashscope') && (
            <button
              type="button"
              className="btn-ghost"
              disabled={probing}
              onClick={runQwenProbe}
            >
              {probing ? 'Testing models...' : 'Test & auto-pick best Qwen models'}
            </button>
          )}
          {message && <span className="muted" style={{ fontSize: 13.5 }} role="status">{message}</span>}
        </div>
      </form>

      {probeResult && (
        <div className="ad-scroll" style={{ marginTop: 18 }}>
          <table className="ad-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Tier</th>
                <th>Reachable</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {probeResult.probes.map((p) => (
                <tr key={p.model}>
                  <td className="ad-mono">{p.model}</td>
                  <td><span className="ad-chip">{p.tier}</span></td>
                  <td>
                    <span className={`ad-chip ${p.reachable ? 'ok' : 'warn'}`}>
                      {p.reachable ? 'ONLINE' : `HTTP ${p.status}`}
                    </span>
                  </td>
                  <td className="ad-mono">{p.latencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Auto-selected tiers: Flagship <code>{probeResult.recommended.flagship}</code> · Standard{' '}
            <code>{probeResult.recommended.standard}</code> · Fast <code>{probeResult.recommended.fast}</code> · Speech{' '}
            <code>{probeResult.recommended.asr}</code> (Endpoint: <code>{probeResult.endpoint}</code>).
          </p>
        </div>
      )}
    </div>
  );
}
