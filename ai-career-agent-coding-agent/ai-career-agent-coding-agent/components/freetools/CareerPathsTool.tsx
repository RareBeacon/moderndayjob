'use client';
import Link from 'next/link';
import { useState } from 'react';

type Path = { direction: string; why: string; buildingOn: string[]; explore: string[] };

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to explore paths, it takes a minute.' },
  CAREER_PROFILE_REQUIRED: { title: 'Complete your profile first', detail: 'Suggestions grow from your real skills. Add them under Profile, then come back.' },
  DAILY_AI_CREDITS_EXHAUSTED: { title: 'Out of AI credits', detail: 'Your daily AI credits are used up. They reset tomorrow.' },
  AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings.' },
  TRUTHFULNESS_FAILED: { title: 'Rejected: unverified skills', detail: 'The draft leaned on skills not in your profile, so it was not returned. Try again.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment.' },
  AI_ALL_PROVIDERS_FAILED: { title: 'AI provider failed', detail: 'The provider could not generate. Your credit was refunded.' },
};

export function CareerPathsTool({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [paths, setPaths] = useState<Path[]>([]);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  async function run() {
    if (!signedIn) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/ai/career-paths', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      if (!r.ok) {
        setError(ERRORS[j?.error] ?? { title: 'Something went wrong', detail: j?.error ?? 'Unexpected error.' });
        setState('error');
        return;
      }
      setPaths(j.paths ?? []);
      setSummary(j.summary ?? '');
      setState('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setState('error');
    }
  }

  return (
    <div className="ft-tool">
      <p className="muted" style={{ margin: 0 }}>
        Three directions worth exploring, grown from the skills you actually have, each one cites
        the exact skills it builds on, and a checker rejects anything your profile can&apos;t back up.
      </p>
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={state === 'loading'}>
            {state === 'loading' ? 'Exploring…' : 'Suggest my paths'}
          </button>
        ) : (
          <Link className="btn" href="/signup">Create a free account</Link>
        )}
        <span className="muted" style={{ fontSize: 13.5 }}>Costs 1 daily AI credit.</span>
      </div>

      {!signedIn && (
        <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
          Free forever plan included, 2 AI credits every day.{' '}
          <Link href="/login" className="inline-link">Already have an account? Sign in →</Link>
        </p>
      )}

      {state === 'loading' && <p className="muted" style={{ marginTop: 16 }}>Reading your verified skills and mapping adjacent directions…</p>}

      {state === 'error' && error && (
        <div className="ft-err" role="alert">
          <h2>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {state === 'done' && (
        <div style={{ marginTop: 20 }} aria-live="polite">
          <p style={{ color: 'var(--ink-2)' }}>{summary}</p>
          <div className="ft-paths">
            {paths.map((p, i) => (
              <article className="ft-path" key={i}>
                <span className="ft-path-n">{i + 1}</span>
                <div>
                  <h2>{p.direction}</h2>
                  <p>{p.why}</p>
                  <div className="ft-meta" style={{ marginTop: 10 }}>
                    {p.buildingOn.map((s) => <span className="ft-chip" key={s}>✓ {s}</span>)}
                  </div>
                  <div className="ft-meta" style={{ marginTop: 8 }}>
                    {p.explore.map((s) => <span className="ft-chip" key={s} style={{ color: 'var(--muted)' }}>{s}</span>)}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            Exploratory suggestions, not guaranteed outcomes, verify any path against real listings
            in your market before committing time to it.
          </p>
        </div>
      )}
    </div>
  );
}
