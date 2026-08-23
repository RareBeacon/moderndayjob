'use client';

import { useEffect, useState } from 'react';

type Kind = 'CV' | 'COVER_LETTER' | 'ANSWERS';

interface Claim {
  category: string;
  value: string;
  reason?: string;
}
interface Report {
  supported: Claim[];
  unsupported: Claim[];
  suspicious: Claim[];
  passed: boolean;
  summary: string;
}
interface Job {
  id: string;
  company: string;
  title: string;
}
interface GenDoc {
  id: string;
  kind: Kind;
  title: string;
  version: number;
  created_at: string;
  source_facts?: { truthfulnessPassed?: boolean };
}

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'CV', label: 'Tailored CV', hint: 'ATS-ready, structured' },
  { id: 'COVER_LETTER', label: 'Cover letter', hint: 'Concise & specific' },
  { id: 'ANSWERS', label: 'Application answers', hint: 'Question-by-question' },
];

export default function GeneratePage() {
  const [kind, setKind] = useState<Kind>('CV');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState('');
  const [questions, setQuestions] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ content: string; report: Report; version?: number } | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [recent, setRecent] = useState<GenDoc[]>([]);

  useEffect(() => {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => {});
    loadRecent();
  }, []);

  function loadRecent() {
    fetch('/api/documents/generated')
      .then((r) => r.json())
      .then((d) => setRecent(d.documents ?? []))
      .catch(() => {});
  }

  async function generate() {
    setStatus('loading');
    setError(null);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { kind };
      if (jobId) payload.jobId = jobId;
      if (kind === 'ANSWERS') {
        const qs = questions.split('\n').map((s) => s.trim()).filter(Boolean);
        payload.questions = qs;
      }
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        const map: Record<string, { title: string; detail: string }> = {
          AI_CREDENTIAL_NOT_CONFIGURED: { title: 'Connect an AI provider', detail: 'Add an OpenRouter or Hugging Face API key in Settings.' },
          DAILY_AI_CREDITS_EXHAUSTED: { title: 'Out of AI credits', detail: 'Your daily AI credits are used up. They reset tomorrow.' },
          CAREER_PROFILE_REQUIRED: { title: 'Complete your profile', detail: 'Generation needs your career profile first.' },
          RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment.' },
          TRUTHFULNESS_FAILED: { title: 'Rejected: unsupported facts', detail: 'The draft contained claims not in your profile, so it was not saved. Review the flags and try again.' },
          ANSWERS_REQUIRES_QUESTIONS: { title: 'Add questions', detail: 'Enter at least one application question.' },
          AI_ALL_PROVIDERS_FAILED: { title: 'AI provider failed', detail: 'The provider(s) could not generate. Your credit was refunded.' },
        };
        if (json?.error === 'TRUTHFULNESS_FAILED') {
          setResult({ content: json.draft ?? '', report: json.report });
          setStatus('error');
          setError(map.TRUTHFULNESS_FAILED);
          return;
        }
        const known = map[json?.error] ?? { title: 'Something went wrong', detail: json?.error ?? 'Unexpected error.' };
        setError(known);
        setStatus('error');
        return;
      }
      setResult({ content: json.document.content, report: json.report, version: json.document.version });
      setStatus('done');
      loadRecent();
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server.' });
      setStatus('error');
    }
  }

  return (
    <div className="workspace">
      <div className="workspace-hero" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">Application intelligence</p>
        <h1>Generate documents</h1>
        <p style={{ color: 'var(--muted)', fontSize: 17, margin: '14px 0 0' }}>
          CVs, cover letters, and application answers — built only from your verified profile facts and
          checked for truthfulness before they’re saved. Each generation is an immutable version.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 820, marginBottom: 18 }}>
        <p className="eyebrow" style={{ marginBottom: 10 }}>What do you need?</p>
        <div className="chip-group" style={{ marginBottom: 16 }}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              className="chip"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              title={k.hint}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
          Tailor to a job (optional)
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#fff', font: 'inherit', fontWeight: 400 }}
          >
            <option value="">General (no specific job)</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title} — {j.company}</option>
            ))}
          </select>
        </label>

        {kind === 'ANSWERS' && (
          <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', marginTop: 16 }}>
            Application questions (one per line)
            <textarea
              rows={5}
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder={'Why do you want this role?\nDescribe a challenge you solved.'}
              style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#fff', font: 'inherit', fontWeight: 400, resize: 'vertical' }}
            />
          </label>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn" onClick={generate} disabled={status === 'loading'}>
            {status === 'loading' ? 'Generating…' : 'Generate'}
          </button>
          <span className="muted" style={{ fontSize: 13.5 }}>Costs 1 AI credit.</span>
        </div>
      </div>

      {status === 'loading' && <div className="card" style={{ maxWidth: 820 }}><p className="muted">Generating and checking for truthfulness…</p></div>}

      {error && (
        <div className="card" style={{ maxWidth: 820, borderColor: 'var(--danger-line)' }}>
          <h2 style={{ fontSize: 17, color: 'var(--danger)' }}>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{error.detail}</p>
        </div>
      )}

      {result && (
        <div className="card" style={{ maxWidth: 820 }}>
          <ReportBar report={result.report} version={result.version} />
          <div style={{ marginTop: 16 }}>
            <ContentRender kind={kind} content={result.content} />
          </div>
          {result.report.unsupported.length > 0 && (
            <ClaimList title="Unsupported claims (rejected)" claims={result.report.unsupported} color="var(--danger)" />
          )}
          {result.report.suspicious.length > 0 && (
            <ClaimList title="Unverified skills to review" claims={result.report.suspicious} color="var(--warning)" />
          )}
        </div>
      )}

      {recent.length > 0 && (
        <section style={{ maxWidth: 820, marginTop: 28 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Recent versions</h2>
          <div className="document-list">
            {recent.map((d) => (
              <div className="document-row card" key={d.id} style={{ padding: 16 }}>
                <div>
                  <strong>{d.title}</strong>
                  <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                    v{d.version} · {new Date(d.created_at).toLocaleString()} · {d.kind}
                  </p>
                </div>
                <span className="badge" style={
                  d.source_facts?.truthfulnessPassed === false
                    ? { background: 'var(--danger-bg)', color: 'var(--danger)' }
                    : { background: 'var(--success-bg)', color: 'var(--success)' }
                }>
                  {d.source_facts?.truthfulnessPassed === false ? 'flagged' : 'verified'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ReportBar({ report, version }: { report: Report; version?: number }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="badge" style={
        report.passed
          ? { background: 'var(--success-bg)', color: 'var(--success)' }
          : { background: 'var(--danger-bg)', color: 'var(--danger)' }
      }>
        {report.passed ? 'Truthful — saved' : 'Rejected'}
      </span>
      {version && <span className="muted" style={{ fontSize: 13 }}>Version {version}</span>}
      <span className="muted" style={{ fontSize: 13 }}>{report.summary}</span>
    </div>
  );
}

function ClaimList({ title, claims, color }: { title: string; claims: Claim[]; color: string }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color, margin: '0 0 8px' }}>{title}</h3>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
        {claims.map((c, i) => (
          <li key={i} style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            <strong style={{ color }}>{c.value}</strong> {c.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContentRender({ kind, content }: { kind: Kind; content: string }) {
  if (kind === 'COVER_LETTER') {
    return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 15, color: 'var(--ink-2)' }}>{content}</pre>;
  }
  try {
    const data = JSON.parse(content);
    if (kind === 'CV') {
      return (
        <div>
          <h2 style={{ fontSize: 20 }}>{data.headline}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{data.summary}</p>
          {data.experiences?.map((e: { company: string; title: string; bullets: string[] }, i: number) => (
            <div key={i} style={{ marginTop: 14 }}>
              <strong>{e.title}</strong> · <span className="muted">{e.company}</span>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {e.bullets?.map((b: string, j: number) => <li key={j} style={{ fontSize: 14, color: 'var(--ink-2)' }}>{b}</li>)}
              </ul>
            </div>
          ))}
          {data.skills?.length ? <p className="muted" style={{ marginTop: 14, fontSize: 14 }}><strong>Skills:</strong> {data.skills.join(', ')}</p> : null}
        </div>
      );
    }
    // ANSWERS
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {data.answers?.map((a: { question: string; answer: string }, i: number) => (
          <div key={i}>
            <strong style={{ fontSize: 14 }}>{a.question}</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{a.answer}</p>
          </div>
        ))}
      </div>
    );
  } catch {
    return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{content}</pre>;
  }
}
