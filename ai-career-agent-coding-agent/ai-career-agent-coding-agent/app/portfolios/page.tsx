'use client';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';
import { PORTFOLIO_TEMPLATES } from '@/lib/portfolios.shared';

/**
 * Portfolio Studio (Milestone 6). Create, edit, publish, export. The plan's
 * record limit (1/5/10/26) is enforced server-side; this page just shows it.
 * Editing, previewing and re-downloading never consume anything: portfolios
 * are record-limited, not credit-metered.
 */

type Portfolio = {
  id: string;
  slug: string;
  title: string;
  template_id: string;
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  updated_at: string;
};

type Draft = {
  headline: string;
  about: string;
  skills: string;
};

export default function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTemplate, setNewTemplate] = useState<string>('clean');
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Portfolio | null>(null);
  const [draft, setDraft] = useState<Draft>({ headline: '', about: '', skills: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolios');
      const out = await res.json().catch(() => ({}));
      setPortfolios(out.portfolios ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle || 'My portfolio', templateId: newTemplate }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewTitle('');
        await load();
        setMessage('Created. It is private until you publish it.');
      } else if (out.error === 'PORTFOLIO_LIMIT_REACHED') {
        setMessage(out.message ?? 'Your plan limit is reached.');
      } else if (out.error === 'ONBOARDING_REQUIRED') {
        setMessage('Finish your profile setup first (the dashboard shows what is missing).');
      } else {
        setMessage('Could not create the portfolio. Please try again.');
      }
    } finally {
      setCreating(false);
    }
  };

  const openEditor = async (p: Portfolio) => {
    setEditing(p);
    setMessage(null);
    const res = await fetch(`/api/portfolios/${p.id}`);
    const out = await res.json().catch(() => ({}));
    const data = out.portfolio?.data ?? {};
    setDraft({
      headline: data.headline ?? '',
      about: data.about ?? '',
      skills: (data.skills ?? []).join(', '),
    });
  };

  const save = async () => {
    if (!editing) return;
    const res = await fetch(`/api/portfolios/${editing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: {
          ...(await (await fetch(`/api/portfolios/${editing.id}`)).json()).portfolio?.data,
          headline: draft.headline,
          about: draft.about,
          skills: draft.skills.split(',').map((s) => s.trim()).filter(Boolean),
        },
      }),
    });
    setMessage(res.ok ? 'Saved.' : 'Could not save. Please try again.');
    await load();
  };

  const setVisibility = async (p: Portfolio, visibility: Portfolio['visibility']) => {
    const res = await fetch(`/api/portfolios/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility }),
    });
    if (res.ok) {
      await load();
      setMessage(visibility === 'PRIVATE' ? 'Back to private.' : visibility === 'PUBLIC' ? 'Published: it now has a public link and can appear in search.' : 'Unlisted: reachable by link only.');
    }
  };

  const remove = async (p: Portfolio) => {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/portfolios/${p.id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
      setMessage('Deleted.');
    }
  };

  return (
    <AppShell active="portfolios" title="Portfolio Studio">
      <section className="workspace-hero">
        <p className="eyebrow">PORTFOLIO STUDIO</p>
        <h1>Your work, on one public page</h1>
        <p>
          Build a portfolio page and share it with a link. Your plan sets how many portfolios you can have (Free 1, Basic 5,
          Premium 10, Max 26). Creating, editing and downloading never uses an AI credit.
        </p>
        {message && (
          <p className="form-status" role="status">
            {message}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: 1, minWidth: 220 }}>
            New portfolio title
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ada Lovelace, Platform Engineer" />
          </label>
          <label>
            Template
            <select value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)}>
              {PORTFOLIO_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" onClick={() => void create()} disabled={creating}>
            {creating ? 'Creating…' : 'Create portfolio'}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        {loading ? (
          <p>Loading your portfolios…</p>
        ) : portfolios.length === 0 ? (
          <p>No portfolios yet. Create your first one above.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Title', 'Visibility', 'Public link', 'Updated', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)', padding: '8px 10px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolios.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>{p.title}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
                    {p.visibility === 'PUBLIC' ? 'Public' : p.visibility === 'UNLISTED' ? 'Unlisted' : 'Private'}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
                    {p.visibility === 'PRIVATE' ? 'n/a' : (
                      <a href={`/portfolio/${p.slug}`} target="_blank" rel="noreferrer">
                        /portfolio/{p.slug}
                      </a>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>{p.updated_at.slice(0, 10)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                    <button className="text-button" onClick={() => void openEditor(p)}>
                      Edit
                    </button>{' '}
                    {p.visibility === 'PRIVATE' ? (
                      <>
                        <button className="text-button" onClick={() => void setVisibility(p, 'UNLISTED')}>
                          Unlist
                        </button>{' '}
                        <button className="text-button" onClick={() => void setVisibility(p, 'PUBLIC')}>
                          Publish
                        </button>{' '}
                      </>
                    ) : (
                      <>
                        <button className="text-button" onClick={() => void setVisibility(p, 'PRIVATE')}>
                          Make private
                        </button>{' '}
                      </>
                    )}
                    <a className="text-button" href={`/api/portfolios/${p.id}/export?format=pdf`}>
                      PDF
                    </a>{' '}
                    <a className="text-button" href={`/api/portfolios/${p.id}/export?format=html`}>
                      HTML
                    </a>{' '}
                    <button className="text-button danger" onClick={() => void remove(p)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <section style={{ marginTop: 32, maxWidth: 640 }}>
          <h2 style={{ fontSize: 20 }}>Editing: {editing.title}</h2>
          <div className="form-stack">
            <label>
              Headline
              <input value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} placeholder="Platform Engineer" />
            </label>
            <label>
              About
              <textarea rows={4} value={draft.about} onChange={(e) => setDraft({ ...draft, about: e.target.value })} placeholder="Two or three sentences about you." />
            </label>
            <label>
              Skills (comma separated)
              <input value={draft.skills} onChange={(e) => setDraft({ ...draft, skills: e.target.value })} placeholder="TypeScript, Postgres, Kubernetes" />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={() => void save()}>
                Save changes
              </button>
              <button className="text-button" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  );
}
