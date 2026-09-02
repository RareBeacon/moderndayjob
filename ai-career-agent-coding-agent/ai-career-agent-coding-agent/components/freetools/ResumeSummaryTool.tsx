'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CopyButton } from './CopyButton';

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to write your summary — it takes a minute.' },
  CAREER_PROFILE_REQUIRED: { title: 'Complete your profile first', detail: 'The summary is built from your verified facts. Add your experience under Profile, then come back.' },
  DAILY_AI_CREDITS_EXHAUSTED: { title: 'Out of AI credits', detail: 'Your daily AI credits are used up. They reset tomorrow.' },
  AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings.' },
  TRUTHFULNESS_FAILED: { title: 'Rejected: unsupported facts', detail: 'The draft contained claims not in your profile, so it was not returned. Try again.' },
  AI_ALL_PROVIDERS_FAILED: { title: 'AI provider failed', detail: 'The provider could not generate. Your credit was refunded.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment.' },
};

export function ResumeSummaryTool({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [options, setOptions] = useState<string[]>([]);
  const [provider, setProvider] = useState<string | undefined>();
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  async function run() {
    if (!signedIn) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/ai/profile-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'SUMMARY' }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(ERRORS[j?.error] ?? { title: 'Something went wrong', detail: j?.error ?? 'Unexpected error.' });
        setState('error');
        return;
      }
      setOptions(j.options ?? []);
      setProvider(j.provider);
      setState('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setState('error');
    }
  }

  return (
    <div className="ft-tool">
      <p className="muted" style={{ margin: 0 }}>
        Three summary options written from your verified profile facts — every employer, skill, and
        school claim is checked before anything reaches you. Nothing invented, ever.
      </p>
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={state === 'loading'}>
            {state === 'loading' ? 'Writing…' : 'Write my summaries'}
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>Truthful — verified</span>
            <span className="muted" style={{ fontSize: 13 }}>Every claim checked against your profile.</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {options.map((o, i) => (
              <div className="ft-opt" key={i}>
                <p>{o}</p>
                <CopyButton text={o} />
              </div>
            ))}
          </div>
          {provider && (
            <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
              Drafted by {provider}. Paste into your CV — the full resume studio keeps versions immutable.
            </p>
          )}
          <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
            <Link href="/generate" className="inline-link">Open the resume studio →</Link> to build the full CV.
          </p>
        </div>
      )}
    </div>
  );
}
