'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';

type A = {
  id: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  jobs: { company: string; title: string; url: string; location: string | null } | null;
};

export default function Applications() {
  const [items, setItems] = useState<A[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch('/api/applications');
    if (r.ok) setItems((await r.json()).applications || []);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'manual', company: f.get('company'), title: f.get('title'), url: f.get('url'), status: f.get('status') }),
    });
    setBusy(false);
    if (!r.ok) { setStatus('We could not save that application. Check the job URL and try again.'); return; }
    setStatus('Application saved to your private history.');
    e.currentTarget.reset();
    load();
  }

  return (
    <AppShell active="applications" title="Applications">
      <section className="workspace-hero">
        <p className="eyebrow">APPLICATIONS</p>
        <h1>Every application, in context.</h1>
        <p>Track applications you submit yourself today. Future assisted workflows will keep the same audit trail.</p>
        <button className="btn" onClick={() => setOpen(!open)}>{open ? 'Close form' : 'Track an application'}</button>
        {open && (
          <form className="form-stack track-form" onSubmit={submit}>
            <label>Company<input name="company" required placeholder="Company name" /></label>
            <label>Role title<input name="title" required placeholder="Role title" /></label>
            <label>Job URL<input name="url" type="url" required placeholder="https://…" /></label>
            <label>Current status<select name="status" defaultValue="DRAFT">
              <option value="DRAFT">Draft / preparing</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="INTERVIEW">Interview</option>
              <option value="REJECTED">Rejected</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select></label>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save application'}</button>
          </form>
        )}
        {status && <p className="form-status">{status}</p>}
      </section>
      <section className="application-list">
        {items.length === 0 ? (
          <article className="card"><h2>No applications tracked yet.</h2><p className="muted">When you track an application, its company, role, source URL, and status will live here.</p></article>
        ) : (
          items.map((a) => (
            <article className="card application-row" key={a.id}>
              <div>
                <p className="eyebrow">{a.status}</p>
                <h2>{a.jobs?.title || 'Untitled role'}</h2>
                <p className="muted">{a.jobs?.company || 'Unknown company'} · Added {new Date(a.created_at).toLocaleDateString()}</p>
              </div>
              {a.jobs?.url && <a className="inline-link" href={a.jobs.url} target="_blank" rel="noreferrer">View source ↗</a>}
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}
