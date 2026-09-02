'use client';
import Link from 'next/link';
import { useState } from 'react';

type Result = {
  role: string | null;
  questions: { question: string; focus: string }[];
  preparationTips: string[];
  provider?: string;
};

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to generate questions — it takes a minute.' },
  DAILY_AI_CREDITS_EXHAUSTED: { title: 'Daily AI credits used up', detail: 'Your free daily credits are exhausted. They reset tomorrow — or upgrade for more.' },
  AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings to power this tool.' },
  AI_ALL_PROVIDERS_FAILED: { title: 'Generation failed', detail: 'The AI provider could not process this listing. Your credit was refunded.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment and try again.' },
  INVALID_BODY: { title: 'Paste a bit more', detail: 'The job description needs to be at least 30 characters.' },
};

export function InterviewQuestionsTool({ signedIn }: { signedIn: boolean }) {
  const [jd, setJd] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const enough = jd.trim().length >= 30;

  async function run() {
    if (!signedIn || !enough) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/ai/interview-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDescription: jd }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(ERRORS[j?.error] ?? { title: 'Something went wrong', detail: j?.error ?? 'Unexpected error.' });
        setState('error');
        return;
      }
      setResult(j.result);
      setState('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setState('error');
    }
  }

  return (
    <div className="ft-tool">
      <label className="ft-label" htmlFor="iq-jd">Paste the job description</label>
      <textarea
        id="iq-jd"
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        placeholder="Paste the listing you're interviewing for — requirements, duties, everything."
      />
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={!enough || state === 'loading'}>
            {state === 'loading' ? 'Writing questions…' : 'Generate practice questions'}
          </button>
        ) : (
          <Link className="btn" href="/signup">Create a free account to run</Link>
        )}
        <span className="muted" style={{ fontSize: 13.5 }}>
          {enough ? 'Costs 1 daily AI credit.' : `${jd.trim().length}/30 characters minimum.`}
        </span>
      </div>

      {!signedIn && (
        <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
          Free forever plan included — 2 AI credits every day.{' '}
          <Link href="/login" className="inline-link">Already have an account? Sign in →</Link>
        </p>
      )}

      {state === 'loading' && <p className="muted" style={{ marginTop: 16 }}>Reading the listing and drafting realistic questions…</p>}

      {state === 'error' && error && (
        <div className="ft-err" role="alert">
          <h2>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {state === 'done' && result && (
        <div style={{ marginTop: 20 }}>
          {result.role && <div className="ft-meta"><span className="ft-chip">{result.role}</span></div>}
          <ol className="ft-qlist">
            {result.questions.map((q, i) => (
              <li key={i}>
                <span className="n" aria-hidden="true">{i + 1}</span>
                <div>
                  <b>{q.question}</b>
                  <span>Tests: {q.focus}</span>
                </div>
              </li>
            ))}
          </ol>
          {result.preparationTips.length > 0 && (
            <div className="ft-sec" style={{ marginTop: 20 }}>
              <h2 style={{ fontSize: 16 }}>How to prepare</h2>
              <ul className="ft-points" style={{ marginTop: 10 }}>
                {result.preparationTips.map((t, i) => (
                  <li key={i}><b style={{ fontWeight: 600 }}>{t}</b></li>
                ))}
              </ul>
            </div>
          )}
          {result.provider && (
            <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
              Questions by {result.provider}, based only on what this listing states. Practice material — not a guarantee of what will be asked.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
