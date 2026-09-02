'use client';
import Link from 'next/link';
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
  summary: string;
}

interface Outcome {
  matches: JobMatch[];
  excludedCount: number;
  scoredCount: number;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  strong: 'Strong fit',
  moderate: 'Moderate fit',
  weak: 'Weak fit',
};

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to run matching, it takes a minute.' },
  CAREER_PROFILE_REQUIRED: { title: 'Complete your profile first', detail: 'Matching needs your career profile. Fill it in under Profile, then come back.' },
  DAILY_AI_CREDITS_EXHAUSTED: { title: 'Daily AI credits used up', detail: 'Your free daily credits are exhausted. They reset tomorrow, or upgrade for more.' },
  AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings to power matching.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment and try again.' },
  AI_MATCH_FAILED: { title: 'Matching failed', detail: 'The AI provider could not score these jobs. Your credit was refunded.' },
};

export function SkillsMatcherTool({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [data, setData] = useState<Outcome | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function run() {
    if (!signedIn) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/ai/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(ERRORS[j?.error] ?? { title: 'Something went wrong', detail: j?.error ?? 'Unexpected error.' });
        setState('error');
        return;
      }
      setData(j as Outcome);
      setState('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setState('error');
    }
  }

  return (
    <div className="ft-tool">
      <p className="muted" style={{ margin: 0 }}>
        We score the jobs in your pool against your real profile and explain exactly why each one fits,
        strengths, gaps, and the skills that matter. Jobs you&apos;ve already applied to are excluded.
      </p>
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={state === 'loading'}>
            {state === 'loading' ? 'Scoring jobs…' : 'Find my matches'}
          </button>
        ) : (
          <Link className="btn" href="/signup">Create a free account</Link>
        )}
        <span className="muted" style={{ fontSize: 13.5 }}>Costs 1 daily AI credit per run.</span>
      </div>

      {!signedIn && (
        <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
          Free forever plan included, 2 AI credits every day.{' '}
          <Link href="/login" className="inline-link">Already have an account? Sign in →</Link>
        </p>
      )}

      {state === 'loading' && <p className="muted" style={{ marginTop: 16 }}>Analyzing your jobs against your profile. This can take a few seconds…</p>}

      {state === 'error' && error && (
        <div className="ft-err" role="alert">
          <h2>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {state === 'done' && data && (
        <div style={{ marginTop: 20 }}>
          <div className="usage-strip" aria-live="polite">
            <span><b>{data.matches.length}</b> matches</span>
            <span><b>{data.scoredCount}</b> scored</span>
            {data.excludedCount > 0 && <span><b>{data.excludedCount}</b> filtered</span>}
          </div>

          {data.matches.length === 0 ? (
            <div className="card" style={{ marginTop: 14 }}>
              <h2 style={{ fontSize: 17 }}>No matches above threshold</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                {data.scoredCount > 0
                  ? 'Jobs were scored but none reached the fit threshold. Broaden your preferences or add more skills.'
                  : 'There are no eligible jobs in your pool yet. Browse jobs first.'}
              </p>
              <div className="dashboard-links" style={{ marginTop: 10 }}>
                <Link href="/jobs" className="inline-link">Browse jobs →</Link>
                <Link href="/profile" className="inline-link">Update profile →</Link>
              </div>
            </div>
          ) : (
            <div className="match-list">
              {data.matches.slice(0, 5).map((m) => (
                <article className="card match-card" key={m.jobId}>
                  <div className="match-head">
                    <div className="match-id" style={{ flex: 1, minWidth: 0 }}>
                      <div className="match-verdictline">
                        <span className={`vchip ${m.verdict}`}>{VERDICT_LABEL[m.verdict]}</span>
                        <span className="vscore">{Math.round(m.score)}% alignment</span>
                      </div>
                      <h2 style={{ fontSize: 17, margin: '8px 0 2px' }}>{m.title || 'Untitled role'}</h2>
                      <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
                        {m.company || 'Unknown company'}{m.location ? ` · ${m.location}` : ''}
                      </p>
                    </div>
                  </div>
                  <p style={{ marginTop: 12, color: 'var(--ink-2)', fontSize: 14.5 }}>{m.summary}</p>
                  <button
                    className="text-button"
                    style={{ color: 'var(--brand)', marginTop: 8, fontSize: 13.5 }}
                    onClick={() => setOpen(open === m.jobId ? null : m.jobId)}
                    aria-expanded={open === m.jobId}
                  >
                    {open === m.jobId ? 'Hide why' : 'Why this job?'}
                  </button>
                  {open === m.jobId && (
                    <div className="match-detail">
                      <div>
                        <h3>Strengths</h3>
                        <ul>{m.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                      <div>
                        <h3>Gaps</h3>
                        <ul>{m.gaps.length ? m.gaps.map((s, i) => <li key={i}>{s}</li>) : <li>None noted</li>}</ul>
                      </div>
                      <p className="muted" style={{ fontSize: 12, gridColumn: '1 / -1' }}>
                        % alignment compares your verified profile to this listing&apos;s stated requirements, it never guarantees an interview.
                      </p>
                    </div>
                  )}
                </article>
              ))}
              {data.matches.length > 5 && (
                <p className="muted" style={{ fontSize: 14 }}>
                  + {data.matches.length - 5} more in your workspace.{' '}
                  <Link href="/match" className="inline-link">Open full matching →</Link>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
