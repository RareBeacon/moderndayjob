'use client';
import Link from 'next/link';
import { useState } from 'react';

type Range = { jobId: string; min: number | null; max: number | null; exact: number | null; currency: string; period: string };
type Result = { scannedCount: number; statedCount: number; ranges: Range[]; notes?: string; note?: string };

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to run the check, it takes a minute.' },
  DAILY_AI_CREDITS_EXHAUSTED: { title: 'Out of AI credits', detail: 'Your daily AI credits are used up. They reset tomorrow.' },
  AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings.' },
  TRUTHFULNESS_FAILED: { title: 'Rejected', detail: 'The draft cited a listing outside the scanned set. Your credit was refunded.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment.' },
  AI_ALL_PROVIDERS_FAILED: { title: 'AI provider failed', detail: 'The provider could not read the listings. Your credit was refunded.' },
};

function fmt(r: Range): string {
  const amount = r.exact != null ? `${r.exact.toLocaleString()} ${r.currency}` : r.min != null && r.max != null ? `${r.min.toLocaleString()}-${r.max.toLocaleString()} ${r.currency}` : r.min != null ? `from ${r.min.toLocaleString()} ${r.currency}` : `up to ${r.max?.toLocaleString()} ${r.currency}`;
  return `${amount} / ${r.period.toLowerCase()}`;
}

export function SalaryInsightsTool({ signedIn }: { signedIn: boolean }) {
  const [role, setRole] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const ok = role.trim().length >= 2;

  async function run() {
    if (!signedIn || !ok) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/ai/salary-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role.trim() }),
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
      <p className="muted" style={{ margin: 0 }}>
        We read up to 20 real listings matching a role and report <b>only the pay ranges they
        explicitly state</b>, no estimates, no invented &quot;market averages&quot;. If listings
        don&apos;t say, we say so.
      </p>
      <div className="ft-fields" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <label className="ft-label" htmlFor="si-role">Role to check</label>
          <input id="si-role" className="ft-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. designer, accountant, developer" />
        </div>
      </div>
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={!ok || state === 'loading'}>
            {state === 'loading' ? 'Reading listings…' : 'Check stated salaries'}
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

      {state === 'loading' && <p className="muted" style={{ marginTop: 16 }}>Scanning the newest listings for that role…</p>}

      {state === 'error' && error && (
        <div className="ft-err" role="alert">
          <h2>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {state === 'done' && result && (
        <div style={{ marginTop: 20 }} aria-live="polite">
          <div className="usage-strip" style={{ marginBottom: 14 }}>
            <span><b>{result.scannedCount}</b> listings scanned</span>
            <span><b>{result.statedCount}</b> stated pay</span>
          </div>
          {result.ranges.length > 0 ? (
            <div className="ft-paths">
              {result.ranges.map((r, i) => (
                <div className="ft-opt" key={i}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{fmt(r)}</p>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>stated in listing</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="dd-empty">
              <p className="muted" style={{ margin: 0 }}>
                {result.notes || 'None of the scanned listings stated a pay range.'} That is normal, most employers keep pay off the listing.
              </p>
            </div>
          )}
          {result.note && <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>{result.note}</p>}
        </div>
      )}
    </div>
  );
}
