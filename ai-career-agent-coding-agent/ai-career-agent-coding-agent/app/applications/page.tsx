'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';

type JobInfo = { company: string; title: string; url: string | null; location: string | null } | null;

type AppItem = {
  id: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  email: string;
  job: JobInfo;
};

type Doc = {
  id: string;
  kind: string;
  title: string;
  version: number;
  created_at: string;
  content: string | null;
  truthfulnessPassed: boolean;
};

type TimelineEvent = { event: string; at: string; meta: Record<string, unknown> };

type Detail = {
  application: {
    id: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
    email: string;
    job: (JobInfo & { id: string }) | null;
  };
  package: Doc[];
  timeline: TimelineEvent[];
  automationEnabled: boolean;
};

const STATUS_TONE: Record<string, string> = {
  PREPARING: 'warn',
  AWAITING_APPROVAL: 'needs',
  APPROVED: 'info',
  SUBMITTED: 'ok',
  INTERVIEW: 'info',
  REJECTED: 'bad',
  WITHDRAWN: 'muted',
  FAILED: 'bad',
  DRAFT: 'muted',
  QUEUED: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
  PREPARING: 'Preparing',
  AWAITING_APPROVAL: 'Needs approval',
  APPROVED: 'Approved',
  SUBMITTED: 'Submitted',
  INTERVIEW: 'Interview',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  FAILED: 'Failed',
  DRAFT: 'Draft',
  QUEUED: 'Queued',
};

const EVENT_LABEL: Record<string, string> = {
  PREPARED: 'Package prepared',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  SUBMITTED: 'Marked submitted',
};

function tone(status: string) {
  return STATUS_TONE[status] ?? 'muted';
}
function label(status: string) {
  return STATUS_LABEL[status] ?? status;
}

function renderDocContent(kind: string, content: string | null) {
  if (!content) return null;
  try {
    const o = JSON.parse(content);
    if (kind === 'CV' && o && typeof o === 'object') {
      return (
        <div>
          {o.headline && <p><b>{String(o.headline)}</b></p>}
          {o.summary && <p style={{ marginTop: 6 }}>{String(o.summary)}</p>}
          {Array.isArray(o.skills) && o.skills.length > 0 && (
            <p style={{ marginTop: 8 }}><b>Skills:</b> {o.skills.map(String).join(', ')}</p>
          )}
          {Array.isArray(o.experiences) &&
            o.experiences.map((e: { title?: string; company?: string; bullets?: string[] }, i: number) => (
              <div key={i} style={{ marginTop: 10 }}>
                <b>{e.title ?? 'Role'}</b>{e.company ? ` · ${e.company}` : ''}
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {Array.isArray(e.bullets) && e.bullets.map((b, j) => <li key={j}>{String(b)}</li>)}
                </ul>
              </div>
            ))}
          {Array.isArray(o.education) &&
            o.education.map((e: { institution?: string; qualification?: string }, i: number) => (
              <p key={i} className="muted" style={{ marginTop: 8 }}>
                {e.institution ?? ''}{e.qualification ? ` · ${e.qualification}` : ''}
              </p>
            ))}
        </div>
      );
    }
    if (kind === 'COVER_LETTER' && o && typeof o.body === 'string') {
      return <div style={{ whiteSpace: 'pre-wrap' }}>{o.body}</div>;
    }
    if (kind === 'ANSWERS' && Array.isArray(o.answers)) {
      return (
        <div>
          {o.answers.map((a: { question?: string; answer?: string }, i: number) => (
            <div key={i} style={{ marginTop: 10 }}>
              <b>{a.question ?? ''}</b>
              <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{a.answer ?? ''}</p>
            </div>
          ))}
        </div>
      );
    }
  } catch {
    /* not JSON; fall through to raw */
  }
  return <pre>{content}</pre>;
}

export default function Applications() {
  const [items, setItems] = useState<AppItem[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const [openTarget, setOpenTarget] = useState(false);
  const [targetMsg, setTargetMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [agentActive, setAgentActive] = useState<boolean | null>(null);
  const [appMode, setAppMode] = useState('approval');

  async function load() {
    const r = await fetch('/api/applications');
    if (r.ok) {
      const j = await r.json();
      setItems(j.applications || []);
      setAutomationEnabled(j.automationEnabled ?? false);
    }
  }
  async function loadAgent() {
    const r = await fetch('/api/preferences');
    if (r.ok) {
      const prefs = (await r.json()).preferences;
      setAgentActive(prefs?.active ?? true);
      setAppMode(prefs?.application_mode ?? 'approval');
    }
  }
  useEffect(() => { load(); loadAgent(); }, []);

  async function openDetail(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    setMsg(null);
    const r = await fetch(`/api/applications/${id}`);
    if (r.ok) {
      const j = await r.json();
      setDetail(j);
      setAutomationEnabled(j.automationEnabled ?? false);
    }
  }

  async function act(id: string, action: 'approve' | 'reject' | 'withdraw' | 'submit') {
    if (busy) return;
    setBusy(action + id);
    setMsg(null);
    const r = await fetch(`/api/applications/${id}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    const j = await r.json();
    setBusy(null);
    if (r.ok) {
      setDetail(j.application);
      await load();
    } else {
      setMsg({ text: friendly(j.error), err: true });
    }
  }

  async function generate(id: string, kind: 'CV' | 'COVER_LETTER') {
    if (!detail || busy) return;
    setBusy('gen' + kind);
    setMsg(null);
    const r = await fetch('/api/documents/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, jobId: detail.application.job?.id, applicationId: id }),
    });
    const j = await r.json();
    setBusy(null);
    if (r.ok) {
      const rd = await fetch(`/api/applications/${id}`);
      if (rd.ok) setDetail(await rd.json());
    } else {
      setMsg({ text: genError(j.error), err: true });
    }
  }

  async function autoSubmit(id: string) {
    if (busy) return;
    setBusy('auto' + id);
    setMsg(null);
    const r = await fetch(`/api/applications/${id}/auto-submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    setBusy(null);
    if (r.ok) {
      setMsg({
        text: 'Submission queued; the agent fills the employer form and stops for any CAPTCHA, login, or unsupported step. Watch the timeline.',
        err: false,
      });
      const rd = await fetch(`/api/applications/${id}`);
      if (rd.ok) setDetail(await rd.json());
      await load();
    } else {
      setMsg({ text: friendly(j.error, j.message), err: true });
    }
  }

  async function toggleAgent() {
    const next = !agentActive;
    setAgentActive(next);
    const r = await fetch('/api/preferences/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: next }),
    });
    if (!r.ok) setAgentActive(!next);
  }

  async function track(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy('track');
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'manual', company: f.get('company'), title: f.get('title'), url: f.get('url'), status: f.get('status') }),
    });
    setBusy(null);
    if (!r.ok) { setFormMsg('We could not save that application. Check the job URL and try again.'); return; }
    setFormMsg('Application saved to your private history.');
    (e.currentTarget as HTMLFormElement).reset();
    load();
  }

  async function startApplication(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy('target');
    setTargetMsg('');
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/applications/target', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: f.get('url'),
        title: f.get('title'),
        company: f.get('company'),
        location: f.get('location') || undefined,
        description: f.get('description') || undefined,
      }),
    });
    setBusy(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setTargetMsg(
        j.error === 'RATE_LIMITED' ? 'You are doing that a bit fast. Wait a moment and try again.' :
        j.error === 'INVALID_JOB_URL' ? 'That link is not a public job posting URL. Use the full https link to the job.' :
        j.error === 'INVALID_BODY' ? 'Add the job link, role title and company, then try again.' :
        'We could not start that application. Check the link and try again.'
      );
      return;
    }
    const j = await r.json();
    setTargetMsg('Application started. Open it below to generate your CV and cover letter, then approve it.');
    (e.currentTarget as HTMLFormElement).reset();
    await load();
    if (j.application?.id) openDetail(j.application.id);
  }

  const st = detail?.application.status;

  return (
    <AppShell active="applications" title="Applications">
      <section className="workspace-hero">
        <p className="eyebrow">APPLICATIONS</p>
        <h1>Every application, in context.</h1>
        <p>
          Bring a job you want as a link or a description, let your agent prepare the package, approve
          it, and track every step; with a full audit trail.{' '}
          {appMode === 'auto'
            ? 'With automatic submission on, your agent sends eligible applications and emails you after each one.'
            : 'Nothing is ever submitted without your approval.'}
        </p>
        <div className="app-actions" style={{ marginTop: 0 }}>
          <button className="btn" onClick={() => setOpenTarget((v) => !v)}>{openTarget ? 'Close' : 'Start an application'}</button>
          <button className="btn-ghost" onClick={() => setOpenForm((v) => !v)}>{openForm ? 'Close form' : 'Track an application'}</button>
        </div>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          {automationEnabled
            ? (agentActive !== null
                ? (appMode === 'auto'
                    ? 'Automatic submission is on; your agent sends eligible applications within your rules and emails you after each one. '
                    : 'Automatic submission is on; approved applications can be filled and sent by the agent. ')
                : '')
            : 'Automatic submission is off; nothing is ever sent without an explicit go-live. '}
          {automationEnabled && agentActive !== null && (
            <button className="inline-link" style={{ fontSize: 13, margin: 0 }} onClick={toggleAgent}>
              {agentActive ? 'Pause agent' : 'Resume agent'}
            </button>
          )}
        </p>
        {openTarget && (
          <form className="form-stack track-form" onSubmit={startApplication}>
            <label>Job link<input name="url" type="url" required placeholder="https://boards.greenhouse.io/… / any job posting link" /></label>
            <label>Role title<input name="title" required placeholder="Role title" /></label>
            <label>Company<input name="company" required placeholder="Company name" /></label>
            <label>Location (optional)<input name="location" placeholder="City, country or remote" /></label>
            <label>Job description (optional, improves tailoring)<textarea name="description" rows={5} placeholder="Paste the job description text if you have it" /></label>
            <button className="btn" disabled={busy !== null}>{busy === 'target' ? 'Starting…' : 'Start my application'}</button>
          </form>
        )}
        {targetMsg && <p className="form-status">{targetMsg}</p>}
        {openForm && (
          <form className="form-stack track-form" onSubmit={track}>
            <label>Company<input name="company" required placeholder="Company name" /></label>
            <label>Role title<input name="title" required placeholder="Role title" /></label>
            <label>Job URL<input name="url" type="url" required placeholder="https://…" /></label>
            <label>Current status<select name="status" defaultValue="DRAFT">
              <option value="DRAFT">Draft / preparing</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="INTERVIEW">Interview</option>
              <option value="REJECTED">Rejected</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select></label>
            <button className="btn" disabled={busy !== null}>{busy === 'track' ? 'Saving…' : 'Save application'}</button>
          </form>
        )}
        {formMsg && <p className="form-status">{formMsg}</p>}
      </section>

      <section className="application-list">
        {items.length === 0 ? (
          <article className="card">
            <h2>No applications tracked yet.</h2>
            <p className="muted">
              Press “Start an application” and paste a job link you want. Your agent prepares the
              package; you review it, generate a CV or cover letter, and approve it here.
            </p>
          </article>
        ) : (
          items.map((a) => (
            <div key={a.id}>
              <article className="card application-row" style={{ cursor: 'pointer' }} onClick={() => openDetail(a.id)}>
                <div>
                  <span className={`app-status ${tone(a.status)}`}>{label(a.status)}</span>
                  <h2>{a.job?.title || 'Untitled role'}</h2>
                  <p className="muted">{a.job?.company || 'Unknown company'} · Added {new Date(a.created_at).toLocaleDateString()}</p>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  {a.job?.url && <a className="inline-link" style={{ marginTop: 0 }} href={a.job.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>View source ↗</a>}
                  <span className="muted" style={{ fontSize: 12 }}>{openId === a.id ? 'Hide details ▴' : 'Details ▾'}</span>
                </div>
              </article>

              {openId === a.id && (
                <DetailPanel
                  detail={detail}
                  busy={busy}
                  msg={msg}
                  status={st}
                  automationEnabled={detail?.automationEnabled ?? false}
                  onAct={(action) => act(a.id, action)}
                  onGenerate={(kind) => generate(a.id, kind)}
                  onAutoSubmit={() => autoSubmit(a.id)}
                />
              )}
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}

function DetailPanel(props: {
  detail: Detail | null;
  busy: string | null;
  msg: { text: string; err: boolean } | null;
  status: string | undefined;
  automationEnabled: boolean;
  onAct: (action: 'approve' | 'reject' | 'withdraw' | 'submit') => void;
  onGenerate: (kind: 'CV' | 'COVER_LETTER') => void;
  onAutoSubmit: () => void;
}) {
  const { detail, busy, msg, status, automationEnabled, onAct, onGenerate, onAutoSubmit } = props;
  if (!detail) return <div className="app-detail"><p className="muted">Loading…</p></div>;

  const job = detail.application.job;
  const canGenerate = status === 'PREPARING' || status === 'AWAITING_APPROVAL';
  const awaiting = status === 'AWAITING_APPROVAL';

  return (
    <div className="app-detail">
      <div className="app-grid">
        <div>
          <p className="eyebrow">PREPARED PACKAGE</p>
          {detail.package.length === 0 ? (
            <p className="muted">
              Nothing generated yet. Generate a CV or cover letter for this job to build your package ; 
              each document is versioned, verified against your profile, and stored immutably.
            </p>
          ) : (
            detail.package.map((d) => (
              <div className="app-doc" key={d.id} style={{ marginBottom: 12 }}>
                <h4>{d.title} <span className="muted" style={{ fontWeight: 400 }}>· v{d.version}</span></h4>
                <span className={d.truthfulnessPassed ? 'pass' : 'fail'}>
                  {d.truthfulnessPassed ? '✓ Truthfulness verified' : '⚠ Not verified'}
                </span>
                {renderDocContent(d.kind, d.content)}
              </div>
            ))
          )}
          {canGenerate && (
            <div className="app-gen">
              <button className="btn" disabled={busy !== null} onClick={() => onGenerate('CV')}>
                {busy === 'genCV' ? 'Generating…' : 'Generate CV'}
              </button>
              <button className="btn-ghost" disabled={busy !== null} onClick={() => onGenerate('COVER_LETTER')}>
                {busy === 'genCOVER_LETTER' ? 'Generating…' : 'Generate cover letter'}
              </button>
            </div>
          )}
        </div>

        <div>
          <p className="eyebrow">TIMELINE</p>
          {detail.timeline.length === 0 ? (
            <p className="muted">No events yet.</p>
          ) : (
            <ul className="app-timeline">
              {detail.timeline.map((t, i) => (
                <li key={i}>
                  <span className="t">{EVENT_LABEL[t.event] ?? t.event}</span>{' '}
                  <span className="when">;  {new Date(t.at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}

          {!detail.application.email && (
            <p className="muted" style={{ marginTop: 14, color: 'var(--color-warning)' }}>
              No application email set. Add one in Profile before approving.
            </p>
          )}

          <div className="app-actions">
            {awaiting && <button className="btn" disabled={busy !== null} onClick={() => onAct('approve')}>{busy === 'approve' + detail.application.id ? '…' : 'Approve application'}</button>}
            {awaiting && <button className="btn-ghost" disabled={busy !== null} onClick={() => onAct('reject')}>Reject</button>}
            {status === 'APPROVED' && automationEnabled && (
              <button className="btn" disabled={busy !== null} onClick={onAutoSubmit}>{busy === 'auto' + detail.application.id ? 'Queuing…' : 'Submit automatically'}</button>
            )}
            {status === 'APPROVED' && (
              <button className={automationEnabled ? 'btn-ghost' : 'btn'} disabled={busy !== null} onClick={() => onAct('submit')}>
                {busy === 'submit' + detail.application.id ? '…' : 'Mark as submitted'}
              </button>
            )}
            {(status === 'PREPARING' || status === 'AWAITING_APPROVAL' || status === 'APPROVED') && (
              <button className="btn-ghost" style={{ color: 'var(--color-error)' }} disabled={busy !== null} onClick={() => onAct('withdraw')}>Withdraw</button>
            )}
          </div>

          {automationEnabled && status === 'APPROVED' && (
            <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
              “Submit automatically” fills the employer’s form and stops for any CAPTCHA, sign-in, or
              unsupported form; it never bypasses security checks, and nothing is sent unless the form is
              positively identified.
            </p>
          )}

          {msg && <p className={`app-msg ${msg.err ? 'err' : ''}`}>{msg.text}</p>}

          {job && (
            <p className="muted" style={{ marginTop: 16, fontSize: 12.5 }}>
              {job.company}; {job.title}. Approval never submits anything automatically; “Mark as
              submitted” only records that you sent it yourself from the job link.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function friendly(code: string, message?: string): string {
  switch (code) {
    case 'EXPIRED_JOB': return 'This job listing is too old to apply to. Find a newer listing instead.';
    case 'REQUIRED_FIELDS_MISSING': return 'Add your application email in Profile and generate a CV or cover letter first.';
    case 'INVALID_TRANSITION': return 'That action is not available for this application right now.';
    case 'NOT_FOUND': return 'Application not found.';
    case 'AUTOMATION_DISABLED': return 'Automatic submission is not enabled yet.';
    case 'NOT_ENTITLED': return 'Your plan does not include automatic submission.';
    case 'UNSUPPORTED_PLATFORM': return 'This employer platform is not supported for automatic submission yet.';
    case 'RATE_LIMITED': return 'Too many requests; slow down a moment.';
    case 'ONBOARDING_REQUIRED': return 'Finish your profile setup first. Open your dashboard and answer the remaining questions to unlock this.';
    default: return message || 'Something went wrong. Please try again.';
  }
}

function genError(code: string): string {
  switch (code) {
    case 'AI_QUOTA_EXHAUSTED': return 'AI document limit reached for your plan - upgrade for more.';
    case 'DAILY_AI_CREDITS_EXHAUSTED': return 'AI document limit reached for your plan - upgrade for more.';
    case 'AI_CREDENTIAL_NOT_CONFIGURED': return 'Jobiest AI is temporarily unavailable. Please try again in a moment.';
    case 'CAREER_PROFILE_REQUIRED': return 'Complete your career profile first.';
    case 'TRUTHFULNESS_FAILED': return 'The draft used unsupported facts and was rejected. Edit your profile and try again.';
    case 'RATE_LIMITED': return 'Too many requests - slow down a moment.';
    case 'ONBOARDING_REQUIRED': return 'Finish your profile setup first. Open your dashboard and answer the remaining questions to unlock this.';
    default: return 'Generation failed. Please try again.';
  }
}
