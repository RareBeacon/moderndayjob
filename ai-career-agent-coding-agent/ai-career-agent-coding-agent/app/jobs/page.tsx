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

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((d) => {
        if (active) setJobs(Array.isArray(d.jobs) ? d.jobs : []);
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

  return (
    <AppShell active="jobs" title="Jobs">
      <section className="workspace-hero">
        <p className="eyebrow">OPPORTUNITIES</p>
        <h1>Discovered jobs.</h1>
        <p>Jobs are normalized from supported public sources, de-duplicated, and ready for matching. Every listing links to a real source, never fabricated.</p>
        <Link className="btn" href="/match">Score these for fit →</Link>
      </section>

      <section className="job-list">
        {loading ? (
          <p className="muted">Loading…</p>
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
