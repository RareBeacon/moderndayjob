'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CopyButton } from './CopyButton';

const ERRORS: Record<string, { title: string; detail: string }> = {
  UNAUTHENTICATED: { title: 'Sign in to continue', detail: 'Create a free account to draft your email, it takes a minute.' },
  DAILY_AI_CREDITS_EXHAUSTED: { title: 'Out of AI credits', detail: 'Your daily AI credits are used up. They reset tomorrow.' },
  AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings.' },
  RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment.' },
  APPLICATION_NOT_FOUND: { title: 'Application not found', detail: 'We could not find that application in your tracker.' },
  AI_ALL_PROVIDERS_FAILED: { title: 'AI provider failed', detail: 'The provider could not generate. Your credit was refunded.' },
};

export function FollowupEmailTool({ signedIn }: { signedIn: boolean }) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [days, setDays] = useState('7');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const ok = company.trim().length >= 2 && role.trim().length >= 2 && /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 90;

  async function run() {
    if (!signedIn || !ok) return;
    setState('loading');
    setError(null);
    try {
      const r = await fetch('/api/ai/followup-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.trim(),
          role: role.trim(),
          daysSinceApplied: Number(days),
          ...(contact.trim() ? { contactName: contact.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(ERRORS[j?.error] ?? { title: 'Something went wrong', detail: j?.error ?? 'Unexpected error.' });
        setState('error');
        return;
      }
      setEmail(j.email);
      setState('done');
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again.' });
      setState('error');
    }
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, placeholder: string, type = 'text') => (
    <div>
      <label className="ft-label" htmlFor={id}>{label}</label>
      <input id={id} className="ft-input" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );

  return (
    <div className="ft-tool">
      <p className="muted" style={{ margin: 0 }}>
        A short, polite follow-up drafted from the facts you give, company, role, when you applied.
        Nothing invented: no fake names, no imagined conversations.
      </p>
      <div className="ft-fields">
        {field('fu-company', 'Company', company, setCompany, 'e.g. PayStack')}
        {field('fu-role', 'Role you applied for', role, setRole, 'e.g. Operations Analyst')}
        {field('fu-days', 'Days since you applied', days, setDays, 'e.g. 7', 'number')}
        {field('fu-contact', 'Contact name (optional)', contact, setContact, 'e.g. Mrs. Adeyemi')}
      </div>
      <div>
        <label className="ft-label" htmlFor="fu-note">Anything to add? (optional)</label>
        <input id="fu-note" className="ft-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I mentioned my supply-chain background" />
      </div>
      <div className="ft-actions">
        {signedIn ? (
          <button className="btn" onClick={run} disabled={!ok || state === 'loading'}>
            {state === 'loading' ? 'Drafting…' : 'Write my follow-up'}
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

      {state === 'loading' && <p className="muted" style={{ marginTop: 16 }}>Drafting a short, polite nudge…</p>}

      {state === 'error' && error && (
        <div className="ft-err" role="alert">
          <h2>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {state === 'done' && email && (
        <div style={{ marginTop: 20 }}>
          <div className="ft-opt">
            <p style={{ fontWeight: 700 }}>{email.subject}</p>
            <CopyButton text={email.subject} />
          </div>
          <div className="ft-opt" style={{ marginTop: 10 }}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{email.body}</p>
            <CopyButton text={email.body} />
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            Read before sending, make it sound like you, and only include what is true.
          </p>
        </div>
      )}
    </div>
  );
}
