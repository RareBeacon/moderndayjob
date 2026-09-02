'use client';
import Link from 'next/link';
import { useState } from 'react';

type Report = { passed: boolean; summary: string };

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to write your letter — it takes a minute.' },
  CAREER_PROFILE_REQUIRED: { title: 'Complete your profile first', detail: 'The letter is built from your verified facts. Add your experience under Profile, then come back.' },
  DAILY_AI_CREDITS_EXHAUSTED: { title: 'Out of AI credits', detail: 'Your daily AI credits are used up. They reset tomorrow.' },
  AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment.' },
  TRUTHFULNESS_FAILED: { title: 'Rejected: unsupported facts', detail: 'The draft contained claims not in your profile, so it was not saved. Try again.' },
  AI_ALL_PROVIDERS_FAILED: { title: 'AI provider failed', detail: 'The provider could not generate. Your credit was refunded.' },
};

export function CoverLetterTool({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [letter, setLetter] = useState('');
  const [version, setVersion] = useState<number | undefined>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  async function run() {
    if (!signedIn) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'COVER_LETTER' }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(ERRORS[j?.error] ?? { title: 'Something went wrong', detail: j?.error ?? 'Unexpected error.' });
        setState('error');
        return;
      }
      setLetter(j.document.content);
      setVersion(j.document.version);
      setReport(j.report ?? null);
      setState('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setState('error');
    }
  }

  return (
    <div className="ft-tool">
      <p className="muted" style={{ margin: 0 }}>
        We write a concise, truthful cover letter from your verified profile facts — never invented
        employers, metrics, or skills. Tailoring to a specific saved job is available in your workspace.
      </p>
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={state === 'loading'}>
            {state === 'loading' ? 'Writing…' : 'Write my cover letter'}
          </button>
        ) : (
          <Link className="btn" href="/signup">Create a free account</Link>
        )}
        <span className="muted" style={{ fontSize: 13.5 }}>Costs 1 daily AI credit.</span>
      </div>

      {!signedIn && (
        <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
          Free forever plan included — 2 AI credits every day.{' '}
          <Link href="/login" className="inline-link">Already have an account? Sign in →</Link>
        </p>
      )}

      {state === 'loading' && <p className="muted" style={{ marginTop: 16 }}>Drafting from your verified facts, then checking truthfulness…</p>}

      {state === 'error' && error && (
        <div className="ft-err" role="alert">
          <h2>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {state === 'done' && (
        <div style={{ marginTop: 20 }}>
          {report && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                {report.passed ? 'Truthful — verified' : 'Rejected'}
              </span>
              {version ? <span className="muted" style={{ fontSize: 13 }}>Saved as immutable version {version}</span> : null}
              <span className="muted" style={{ fontSize: 13 }}>{report.summary}</span>
            </div>
          )}
          <pre className="ft-letter">{letter}</pre>
          <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
            <Link href="/generate" className="inline-link">Open the full resume studio →</Link> to tailor this to a specific job or generate a CV.
          </p>
        </div>
      )}
    </div>
  );
}
