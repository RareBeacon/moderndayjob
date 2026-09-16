'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Support form (public). Submits to /api/support, which stores every
 * message and delivers it to the support inbox with reply-to preserved.
 * The status shown to the user reflects what actually happened.
 */
export function SupportForm({ categories }: { categories: string[] }) {
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // Prefill for signed-in visitors (their account email).
    supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        const address = data.session?.user?.email;
        if (address) setEmail(address);
      })
      .catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, category, subject, message }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && out.ok) {
        setResult({ ok: true, text: out.message ?? 'Message sent.' });
        setSubject('');
        setMessage('');
      } else {
        setResult({ ok: false, text: out.error ?? 'Something went wrong. Please try again.' });
      }
    } catch {
      setResult({ ok: false, text: 'Network error. Please try again, or email support@jobiest.com.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="auth-form" style={{ maxWidth: 'none', marginTop: 26 }} noValidate>
      {result ? (
        <div className={result.ok ? 'auth-success' : 'auth-error'} role="status" aria-live="polite">
          {result.text}
        </div>
      ) : null}
      <label>
        Your email
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        What is this about?
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={150} />
      </label>
      <label>
        Message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          style={{ resize: 'vertical' }}
          placeholder="What happened? What did you expect? Any error message you saw?"
        />
      </label>
      <button type="submit" className="jl-btn-solid" disabled={busy}>
        {busy ? 'Sending…' : 'Contact Support'}
      </button>
      <p className="muted" style={{ fontSize: 13 }}>
        Prefer email? Write to <a href="mailto:support@jobiest.com">support@jobiest.com</a>. For account questions,
        include the email address on your Jobiest account.
      </p>
    </form>
  );
}
