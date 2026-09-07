'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/site/AppShell';

type JobMeta = {
  remote_type?: string;
  employment_type?: string;
  seniority?: string;
  posted_at?: string;
} | null;

type Job = {
  id: string;
  source: string;
  company: string;
  title: string;
  url: string;
  location: string;
  metadata: JobMeta;
  created_at: string;
};

function readQuery(): { q: string; loc: string } {
  if (typeof window === 'undefined') return { q: '', loc: '' };
  const params = new URLSearchParams(window.location.search);
  return { q: (params.get('q') ?? '').trim().toLowerCase(), loc: (params.get('loc') ?? '').trim().toLowerCase() };
}

function matches(job: Job, q: string, loc: string): boolean {
  const hay = `${job.title} ${job.company} ${job.location} ${job.source}`.toLowerCase();
  if (q && !q.split(/\s+/).every((word) => hay.includes(word))) return false;
  if (loc && !job.location.toLowerCase().includes(loc)) return false;
  return true;
}

export default function JobsPage() {
  const [all, setAll] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState<{ q: string; loc: string }>({ q: '', loc: '' });

  useEffect(() => {
    let active = true;
    const q = readQuery();
    setQuery(q);
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((d) => {
        if (active) setAll(Array.isArray(d.jobs) ? d.jobs : []);
      })
      .catch(() => {
        if (active) setStatus('Could not load jobs right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const jobs = all.filter((j) => matches(j, query.q, query.loc));

  return (
    <AppShell active="jobs" title="Jobs">
      <section className="workspace-hero">
        <p className="eyebrow">OPPORTUNITIES</p>
        <h1>Discovered jobs.</h1>
        <p>Jobs are normalized from supported public sources, de-duplicated, and ready for matching. Every listing links to a real source, never fabricated.</p>

        {/* Live filter — updates as you type, mirrors the homepage search */}
        <form
          className="jl-search"
          style={{ marginTop: 20, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)' }}
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="jl-search-field">
            <span className="jl-si" aria-hidden="true">🔍</span>
            <input
              type="search"
              placeholder="Filter by role, company or skill…"
              aria-label="Filter jobs"
              value={query.q}
              onChange={(e) => setQuery((s) => ({ ...s, q: e.target.value }))}
            />
            <button
              type="button"
              className="jl-search-clear"
              aria-label="Clear search"
              hidden={!query.q}
              onClick={() => setQuery((s) => ({ ...s, q: '' }))}
            >
              ×
            </button>
          </div>
          <button className="jl-search-btn" type="submit" style={{ background: 'var(--color-primary)', color: '#fff', minHeight: 44 }}>
            {query.loc ? `Near ${query.loc}` : 'Search'}
          </button>
        </form>

        <div style={{ marginTop: 16 }}>
          <Link className="btn" href="/match">Score these for fit →</Link>
        </div>
      </section>

      <section className="job-list">
        {loading ? (
          <div aria-hidden="true" style={{ display: 'grid', gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div className="card" key={i} style={{ padding: 20 }}>
                <div className="skeleton" style={{ width: '55%', height: 16 }} />
                <div className="skeleton skeleton-line" style={{ width: '35%' }} />
                <div className="skeleton skeleton-line" style={{ width: '70%' }} />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 && all.length > 0 ? (
          <article className="card">
            <h2>No jobs match your search.</h2>
            <p className="muted">
              {query.q ? <>Nothing matched “{query.q}”{query.loc ? ` near ${query.loc}` : ''}.</> : <>No jobs match that location.</>}{' '}
              Try different keywords or a broader location.
            </p>
            <div className="dashboard-links">
              <Link href="/jobs" className="inline-link">Clear search →</Link>
            </div>
          </article>
        ) : jobs.length === 0 ? (
          <article className="card">
            <h2>No jobs discovered yet.</h2>
            <p className="muted">Once discovery runs are connected to the scheduler, normalized opportunities will appear here. Matching and the daily agent come next.</p>
            <div className="dashboard-links">
              <Link href="/dashboard" className="inline-link">Back to dashboard →</Link>
            </div>
          </article>
        ) : (
          jobs.map((j) => (
            <article className="card job-card" key={j.id}>
              <div className="job-main">
                <div className="job-co" aria-hidden="true">{(j.company || '?').slice(0, 1)}</div>
                <div>
                  <h2>{j.title}</h2>
                  <p className="muted">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
                </div>
              </div>
              <div className="job-tags">
                <span className="src-badge">{j.source}</span>
                {j.metadata?.remote_type && j.metadata.remote_type !== 'unknown' ? (
                  <span className="chip">{j.metadata.remote_type}</span>
                ) : null}
                {j.metadata?.employment_type && j.metadata.employment_type !== 'unknown' ? (
                  <span className="chip">{j.metadata.employment_type}</span>
                ) : null}
                {j.metadata?.seniority ? <span className="chip">{j.metadata.seniority}</span> : null}
                {j.url ? (
                  <a className="inline-link" href={j.url} target="_blank" rel="noreferrer noopener">View original →</a>
                ) : null}
              </div>
            </article>
          ))
        )}
        {status ? <p className="form-status">{status}</p> : null}
      </section>
    </AppShell>
  );
}
