'use client';

import { useState } from 'react';

type Verdict = 'strong' | 'moderate' | 'weak';

interface JobMatch {
  jobId: string;
  company: string;
  title: string;
  location: string;
  url?: string;
  score: number;
  verdict: Verdict;
  strengths: string[];
  gaps: string[];
  reasons: string[];
  summary: string;
  provider: string;
}

interface Outcome {
  matches: JobMatch[];
  excludedCount: number;
  cappedCount: number;
  scoredCount: number;
  failures: { jobId: string; error: string }[];
}

const VERDICT_META: Record<Verdict, { label: string; color: string }> = {
  strong: { label: 'Strong fit', color: 'var(--success)' },
  moderate: { label: 'Moderate fit', color: 'var(--warning)' },
  weak: { label: 'Weak fit', color: 'var(--danger)' },
};

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function MatchPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [data, setData] = useState<Outcome | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  async function runMatch() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/ai/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        const map: Record<string, { title: string; detail: string }> = {
          AI_CREDENTIAL_NOT_CONFIGURED: {
            title: 'Connect an AI provider',
            detail: 'Add an OpenRouter or Hugging Face API key in Settings to power matching.',
          },
          DAILY_AI_CREDITS_EXHAUSTED: {
            title: 'Daily AI credits used up',
            detail: 'Your plan’s daily AI credits are exhausted. They reset tomorrow — or upgrade for more.',
          },
          CAREER_PROFILE_REQUIRED: {
            title: 'Complete your profile first',
            detail: 'Matching needs your career profile. Fill it in under Profile, then come back.',
          },
          RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment and try again.' },
          AI_MATCH_FAILED: {
            title: 'Matching failed',
            detail: 'The AI provider(s) could not score these jobs. Your credit was refunded.',
          },
        };
        const known = map[json?.error] ?? {
          title: 'Something went wrong',
          detail: json?.error ?? 'Unexpected error.',
        };
        setError(known);
        setStatus('error');
        return;
      }
      setData(json as Outcome);
      setStatus('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setStatus('error');
    }
  }

  return (
    <div className="workspace">
      <div className="workspace-hero" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">Matching engine</p>
        <h1>Job matches</h1>
        <p style={{ color: 'var(--muted)', fontSize: 17, margin: '14px 0 0' }}>
          We score every job in your pool against your profile and explain exactly why each one fits —
          excluding jobs you’ve already applied to and ones outside your preferences.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '18px 0' }}>
        <button className="btn" onClick={runMatch} disabled={status === 'loading'}>
          {status === 'loading' ? 'Scoring jobs…' : 'Find job matches'}
        </button>
        <span className="muted" style={{ fontSize: 13.5 }}>Costs 1 daily AI credit per run.</span>
      </div>

      {status === 'loading' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <p className="muted">Analyzing your jobs against your profile. This can take a few seconds…</p>
        </div>
      )}

      {status === 'error' && error && (
        <div className="card" style={{ maxWidth: 620, borderColor: 'var(--danger-line)' }}>
          <h2 style={{ fontSize: 18, color: 'var(--danger)' }}>{error.title}</h2>
          <p className="muted" style={{ marginTop: 8 }}>{error.detail}</p>
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={runMatch}>
            Try again
          </button>
        </div>
      )}

      {status === 'done' && data && (
        <>
          <div className="usage-strip" aria-live="polite">
            <span><b>{data.matches.length}</b> matches</span>
            <span><b>{data.scoredCount}</b> scored</span>
            {data.excludedCount > 0 && <span><b>{data.excludedCount}</b> filtered</span>}
            {data.cappedCount > 0 && <span><b>{data.cappedCount}</b> held (batch limit)</span>}
            {data.failures.length > 0 && (
              <span style={{ borderColor: 'var(--warning)' }}><b>{data.failures.length}</b> failed</span>
            )}
          </div>

          {data.matches.length === 0 ? (
            <div className="card" style={{ maxWidth: 620 }}>
              <h2 style={{ fontSize: 18 }}>No matches above threshold</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                {data.scoredCount > 0
                  ? 'Jobs were scored but none reached the fit threshold. Try broadening your preferences or adding more skills to your profile.'
                  : 'There are no eligible jobs to score yet. Browse jobs to populate your pool.'}
              </p>
            </div>
          ) : (
            <div className="match-list">
              {data.matches.map((m) => (
                <MatchCard key={m.jobId} m={m} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MatchCard({ m }: { m: JobMatch }) {
  const [open, setOpen] = useState(false);
  const v = VERDICT_META[m.verdict];
  return (
    <article className="card match-card">
      <div className="match-head">
        <div className="match-score" style={{ borderColor: v.color, color: v.color }}>
          <strong>{Math.round(m.score)}</strong>
          <span>/100</span>
        </div>
        <div className="match-id" style={{ flex: 1, minWidth: 0 }}>
          <span className="badge" style={{ background: 'transparent', color: v.color, border: `1px solid ${v.color}` }}>
            {v.label}
          </span>
          <h2 style={{ fontSize: 18, margin: '8px 0 2px' }}>{m.title || 'Untitled role'}</h2>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            {m.company || 'Unknown company'}
            {m.location ? ` · ${m.location}` : ''}
          </p>
        </div>
        {m.url && (
          <a className="btn btn-ghost btn-sm" href={m.url} target="_blank" rel="noopener noreferrer">
            View job
          </a>
        )}
      </div>

      <p style={{ marginTop: 14, color: 'var(--ink-2)' }}>{m.summary}</p>

      <button
        className="text-button"
        style={{ color: 'var(--brand)', marginTop: 10, padding: 0, fontSize: 14 }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? 'Hide details' : 'Why this match?'}
      </button>

      {open && (
        <div className="match-detail">
          <div>
            <h3>Strengths</h3>
            <ul>{m.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h3>Gaps</h3>
            <ul>{m.gaps.length ? m.gaps.map((s, i) => <li key={i}>{s}</li>) : <li>None noted</li>}</ul>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <h3>Reasoning</h3>
            <ul>{m.reasons.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <p className="muted" style={{ fontSize: 12, gridColumn: '1 / -1' }}>
            Scored by {m.provider}.
          </p>
        </div>
      )}
    </article>
  );
}
