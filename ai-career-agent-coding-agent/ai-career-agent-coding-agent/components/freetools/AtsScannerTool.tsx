'use client';
import Link from 'next/link';
import { useState } from 'react';

type Finding = { check: string; status: 'pass' | 'warn' | 'fail'; detail: string; tip?: string };
type Result = { score: number; findings: Finding[]; stats: { words: number; bullets: number }; keywords?: { matched: string[]; missing: string[] }; note?: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  pass: { label: 'Pass', cls: 'strong' },
  warn: { label: 'Watch', cls: 'moderate' },
  fail: { label: 'Fix', cls: 'weak' },
};

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to run the scan — it takes a minute.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many scans in a row. Wait a moment.' },
  INVALID_BODY: { title: 'Paste a bit more', detail: 'The CV text needs at least 100 characters.' },
};

export function AtsScannerTool({ signedIn }: { signedIn: boolean }) {
  const [cv, setCv] = useState('');
  const [jd, setJd] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const enough = cv.trim().length >= 100;

  async function run() {
    if (!signedIn || !enough) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/ats/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: cv, ...(jd.trim().length >= 30 ? { jobDescription: jd } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(ERRORS[j?.error] ?? { title: 'Something went wrong', detail: j?.error ?? 'Unexpected error.' });
        setState('error');
        return;
      }
      setResult(j);
      setState('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setState('error');
    }
  }

  return (
    <div className="ft-tool">
      <label className="ft-label" htmlFor="ats-cv">Paste your CV text</label>
      <textarea
        id="ats-cv"
        value={cv}
        onChange={(e) => setCv(e.target.value)}
        placeholder="Paste the full text of your CV — headings, roles, dates, everything."
        style={{ minHeight: 150 }}
      />
      <label className="ft-label" htmlFor="ats-jd" style={{ marginTop: 14 }}>
        Job description <span style={{ color: 'var(--muted-2)', fontWeight: 500 }}>(optional — adds keyword matching)</span>
      </label>
      <textarea
        id="ats-jd"
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        placeholder="Paste the listing you're targeting to see which of its key terms your CV already contains."
        style={{ minHeight: 100 }}
      />
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={!enough || state === 'loading'}>
            {state === 'loading' ? 'Scanning…' : 'Scan my CV'}
          </button>
        ) : (
          <Link className="btn" href="/signup">Create a free account to scan</Link>
        )}
        <span className="muted" style={{ fontSize: 13.5 }}>
          {enough ? 'Free — deterministic checks, no AI credits.' : `${cv.trim().length}/100 characters minimum.`}
        </span>
      </div>

      {!signedIn && (
        <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
          Free forever plan included.{' '}
          <Link href="/login" className="inline-link">Already have an account? Sign in →</Link>
        </p>
      )}

      {state === 'error' && error && (
        <div className="ft-err" role="alert">
          <h2>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {state === 'done' && result && (
        <div style={{ marginTop: 20 }} aria-live="polite">
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 600, color: 'var(--brand-ink)' }}>{result.score}</span>
            <span className="muted" style={{ fontSize: 14 }}>out of 100 for structure &amp; parseability · {result.stats.words} words</span>
          </div>
          <div className="ft-findings">
            {result.findings.map((f, i) => (
              <div className="ft-finding" key={i}>
                <span className={`vchip ${STATUS[f.status].cls}`}>{STATUS[f.status].label}</span>
                <div>
                  <b>{f.check}</b>
                  <span>{f.detail}</span>
                  {f.tip && <span className="ft-tip">{f.tip}</span>}
                </div>
              </div>
            ))}
          </div>
          {result.keywords && (
            <div className="ft-meta" style={{ marginTop: 14 }}>
              {result.keywords.matched.map((k) => <span className="ft-chip" key={k}>✓ {k}</span>)}
              {result.keywords.missing.map((k) => <span className="ft-chip" key={k} style={{ color: 'var(--danger)' }}>× {k}</span>)}
            </div>
          )}
          {result.note && <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>{result.note}</p>}
        </div>
      )}
    </div>
  );
}
