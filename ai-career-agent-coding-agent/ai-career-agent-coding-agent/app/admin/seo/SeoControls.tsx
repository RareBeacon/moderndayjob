'use client';

import { useState } from 'react';

export function SeoControls({ paused, connected }: { paused: boolean; connected: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action); setMsg('');
    const r = await fetch('/api/admin/seo/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? `${action} completed` : `${action} failed: ${j.error ?? 'unknown error'}`);
  }
  async function setPaused(next: boolean) {
    setBusy(next ? 'PAUSE' : 'RESUME'); setMsg('');
    const r = await fetch('/api/admin/seo/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: next }),
    });
    setBusy(null);
    setMsg(r.ok ? (next ? 'SEO agent paused' : 'SEO agent resumed') : 'Pause/resume failed');
    if (r.ok) window.location.reload();
  }
  async function createArticle(formData: FormData) {
    const keyword = String(formData.get('keyword') ?? '').trim();
    const status = String(formData.get('status') ?? 'DRAFT');
    if (!keyword) return;
    setBusy('ARTICLE'); setMsg('');
    const r = await fetch('/api/admin/seo/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, status }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? `Article ${status.toLowerCase()} created` : `Article failed: ${j.error ?? 'unknown error'}`);
    if (r.ok) window.location.reload();
  }
  async function selectProperty(formData: FormData) {
    const property = String(formData.get('property') ?? '').trim();
    const sitemapUrl = String(formData.get('sitemapUrl') ?? '').trim();
    if (!property) return;
    setBusy('PROPERTY'); setMsg('');
    const r = await fetch('/api/admin/seo/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property, sitemapUrl: sitemapUrl || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? 'Search Console property saved' : `Property save failed: ${j.error ?? 'unknown error'}`);
    if (r.ok) window.location.reload();
  }

  return (
    <div className="seo-controls">
      <div className="seo-button-row">
        <button className="btn" disabled={!!busy} onClick={() => setPaused(!paused)}>{paused ? 'Resume SEO Agent' : 'Pause SEO Agent'}</button>
        <button className="btn" disabled={!!busy} onClick={() => run('INITIAL_AUDIT')}>Run Initial SEO Audit</button>
        <button className="btn" disabled={!!busy} onClick={() => run('SYNC_STRATEGIC_CONTENT')}>Publish Strategic Content</button>
        <button className="btn" disabled={!!busy} onClick={() => run('VERIFY_SITEMAP')}>Verify Sitemap</button>
        <button className="btn" disabled={!!busy} onClick={() => run('RUN_PUBLIC_URL_AUDIT')}>Audit Public URLs</button>
        <button className="btn" disabled={!!busy || !connected} onClick={() => run('SUBMIT_SITEMAP')}>Submit Sitemap to GSC</button>
        <button className="btn" disabled={!!busy || !connected} onClick={() => run('INSPECT_IMPORTANT_URLS')}>Inspect Important URLs</button>
        <button className="btn" disabled={!!busy || !connected} onClick={() => run('IMPORT_METRICS')}>Import GSC Metrics</button>
      </div>
      <form className="seo-article-form" action={selectProperty}>
        <input name="property" placeholder="Search Console property, e.g. https://jobiest.com/ or sc-domain:jobiest.com" />
        <input name="sitemapUrl" placeholder="Sitemap URL, default https://jobiest.com/sitemap.xml" />
        <button className="btn" disabled={!!busy}>Save GSC Property</button>
      </form>
      <form className="seo-article-form" action={createArticle}>
        <input name="keyword" placeholder="New article keyword, e.g. AI job application agent" />
        <select name="status" defaultValue="DRAFT"><option value="DRAFT">Draft</option><option value="PUBLISHED">Publish</option></select>
        <button className="btn" disabled={!!busy}>Generate SEO Article</button>
      </form>
      {msg && <p className="muted" style={{ marginTop: 10 }}>{busy ? 'Working...' : msg}</p>}
    </div>
  );
}
