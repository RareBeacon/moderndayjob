'use client';
import Link from 'next/link';
import { useState } from 'react';

type Analysis = {
  title: string | null;
  company: string | null;
  seniority: string | null;
  employmentType: string | null;
  location: string | null;
  requiredSkills: string[];
  keywords: string[];
  responsibilities: string[];
  summary: string;
  matchedSkills: string[];
  missingSkills: string[];
  provider?: string;
};

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to run the analyzer, it takes a minute.' },
  DAILY_AI_CREDITS_EXHAUSTED: { title: 'Daily AI credits used up', detail: 'Your free daily credits are exhausted. They reset tomorrow, or upgrade for more.' },
  AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings to power analysis.' },
  AI_ALL_PROVIDERS_FAILED: { title: 'Analysis failed', detail: 'The AI provider could not analyze this listing. Your credit was refunded.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment and try again.' },
  INVALID_BODY: { title: 'Paste a bit more', detail: 'The job description needs to be at least 30 characters.' },
};

export function JDAnalyzerTool({ signedIn }: { signedIn: boolean }) {
  const [jd, setJd] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [skillsCount, setSkillsCount] = useState(0);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const enough = jd.trim().length >= 30;

  async function run() {
    if (!signedIn || !enough) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/ai/analyze-job', {
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
      setAnalysis(j.analysis);
      setSkillsCount(j.profileSkillsCount ?? 0);
      setState('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setState('error');
    }
  }

  return (
    <div className="ft-tool">
      <label className="ft-label" htmlFor="jd">Paste the job description</label>
      <textarea
        id="jd"
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        placeholder="Paste the full listing here, responsibilities, requirements, everything."
      />
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={!enough || state === 'loading'}>
            {state === 'loading' ? 'Analyzing…' : 'Analyze this job'}
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
          Free forever plan included, 2 AI credits every day.{' '}
          <Link href="/login" className="inline-link">Already have an account? Sign in →</Link>
        </p>
      )}

      {state === 'loading' && <p className="muted" style={{ marginTop: 16 }}>Reading the listing and extracting the essentials…</p>}

      {state === 'error' && error && (
        <div className="ft-err" role="alert">
          <h2>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {state === 'done' && analysis && (
        <div style={{ marginTop: 20 }}>
          <p style={{ color: 'var(--ink-2)' }}>{analysis.summary}</p>
          <div className="ft-meta">
            {[analysis.title, analysis.company, analysis.seniority, analysis.employmentType, analysis.location]
              .filter(Boolean)
              .map((m, i) => <span className="ft-chip" key={i}>{m}</span>)}
          </div>

          <div className="mk-ats-break" style={{ marginTop: 16 }}>
            <div className="mk-ats-row">
              <span className="k">Required skills</span>
              <span className="v">
                {skillsCount > 0 ? (
                  <>
                    {analysis.matchedSkills.map((s) => <span className="chip ok" key={s}>✓ {s}</span>)}
                    {analysis.missingSkills.map((s) => <span className="chip no" key={s}>× {s}</span>)}
                  </>
                ) : (
                  analysis.requiredSkills.map((s) => <span className="ft-chip" key={s}>{s}</span>)
                )}
              </span>
            </div>
            <div className="mk-ats-row">
              <span className="k">Keywords</span>
              <span className="v">{analysis.keywords.map((k) => <span className="ft-chip" key={k}>{k}</span>)}</span>
            </div>
            <div className="mk-ats-row">
              <span className="k">Responsibilities</span>
              <span className="v">{analysis.responsibilities.map((rp) => <span className="ft-chip" key={rp}>{rp}</span>)}</span>
            </div>
          </div>

          {skillsCount === 0 && (
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
              <Link href="/profile" className="inline-link">Add skills to your profile →</Link> to see which requirements you already match.
            </p>
          )}
          {analysis.provider && (
            <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Analyzed by {analysis.provider}. Extraction reflects only what the listing states, nothing invented.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
