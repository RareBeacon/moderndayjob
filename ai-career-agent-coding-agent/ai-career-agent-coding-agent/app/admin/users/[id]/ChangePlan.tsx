'use client';

import { useState } from 'react';

/**
 * Admin -> user -> Change Plan (Owner/Admin manual subscription management).
 * Supports Free, Basic (30 successful apps/mo), Premium (50/mo), and Ultra
 * (Unlimited/mo), temporary promotional grants with expiry, revocation back
 * to Free, mandatory reason (>= 5 chars), and explicit confirmation.
 * Manual grants are marked source='ADMIN_GRANT' and never write payment rows.
 */
const PLANS = ['FREE', 'BASIC', 'PREMIUM', 'ULTRA'] as const;
type Plan = (typeof PLANS)[number];

const PLAN_LABELS: Record<Plan, string> = {
  FREE: 'Free (revoke paid access)',
  BASIC: 'Basic (30 apps/mo)',
  PREMIUM: 'Premium (50 apps/mo)',
  ULTRA: 'Ultra (Unlimited apps/mo)',
};

export interface CurrentSubscription {
  plan: string;
  status: string;
  current_period_end: string | null;
  scheduled?: { plan: string; activate_at: string } | null;
}

function fmt(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function normalizeInitialPlan(raw: string): Plan {
  const upper = String(raw ?? '').trim().toUpperCase();
  if (upper === 'ULTRA' || upper === 'MAX') return 'ULTRA';
  if (upper === 'PREMIUM') return 'PREMIUM';
  if (upper === 'BASIC') return 'BASIC';
  return 'FREE';
}

export default function ChangePlan({ userId, current }: { userId: string; current: CurrentSubscription }) {
  const normalizedCurrent = normalizeInitialPlan(current.plan);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>(normalizedCurrent);
  const [duration, setDuration] = useState(30);
  const [startMode, setStartMode] = useState<'IMMEDIATELY' | 'AFTER_CURRENT'>('IMMEDIATELY');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const activePaid = ['BASIC', 'PREMIUM', 'ULTRA'].includes(normalizedCurrent) && (current.status ?? '').startsWith('ACTIVE');
  const effStart = startMode === 'AFTER_CURRENT' && activePaid ? fmt(current.current_period_end) : 'today';
  const reasonValid = reason.trim().length >= 5;

  async function submit() {
    if (busy) return;
    if (!reasonValid) {
      setMessage('Please enter a documented reason (at least 5 characters) for the audit trail.');
      return;
    }
    if (!confirmed) {
      setMessage('Please tick the confirmation box before applying this subscription change.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/admin/subscriptions/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          plan,
          durationDays: plan === 'FREE' ? undefined : duration,
          startMode,
          reason: reason.trim(),
        }),
      });
      const j = await r.json();
      if (j.ok) {
        setResult(j.result);
        setMessage('Subscription updated and recorded in the immutable admin audit log.');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setMessage(j.message ?? j.error ?? 'Unable to update the subscription. No changes were made.');
      }
    } catch {
      setMessage('Network error.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn" style={{ minHeight: 36, fontSize: 13 }} onClick={() => setOpen(true)}>
        Change plan / manual grant
      </button>
    );
  }

  return (
    <div style={{ border: '1px solid rgba(15,23,42,0.14)', borderRadius: 10, padding: 16, marginTop: 10 }}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>Manual Subscription Grant / Plan Override</p>
      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Recorded as complimentary ADMIN_GRANT (never counted as paid financial MRR). Logged in immutable admin audit trail.
      </p>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {PLANS.map((p) => (
          <label key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="radio" name="admin-plan" checked={plan === p} onChange={() => { setPlan(p); setConfirmed(false); }} />
            {PLAN_LABELS[p]}
          </label>
        ))}
      </div>

      {plan !== 'FREE' && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
            <label>
              Duration (days):{' '}
              <input
                type="number"
                min={1}
                max={3650}
                value={duration}
                onChange={(e) => setDuration(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
                style={{ width: 90, marginLeft: 6 }}
              />
            </label>
            <button type="button" className="btn-ghost" style={{ minHeight: 28, padding: '2px 8px', fontSize: 12 }} onClick={() => setDuration(7)}>7d trial</button>
            <button type="button" className="btn-ghost" style={{ minHeight: 28, padding: '2px 8px', fontSize: 12 }} onClick={() => setDuration(30)}>30d month</button>
            <button type="button" className="btn-ghost" style={{ minHeight: 28, padding: '2px 8px', fontSize: 12 }} onClick={() => setDuration(90)}>90d quarter</button>
            <button type="button" className="btn-ghost" style={{ minHeight: 28, padding: '2px 8px', fontSize: 12 }} onClick={() => setDuration(365)}>365d year</button>
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" name="admin-start" checked={startMode === 'IMMEDIATELY'} onChange={() => setStartMode('IMMEDIATELY')} />
              Start immediately
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', opacity: activePaid ? 1 : 0.5 }}>
              <input
                type="radio"
                name="admin-start"
                disabled={!activePaid}
                checked={startMode === 'AFTER_CURRENT'}
                onChange={() => setStartMode('AFTER_CURRENT')}
              />
              After current subscription {!activePaid && '(none active)'}
            </label>
          </div>
        </>
      )}

      <label style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
        Reason for audit trail (required, min 5 chars):{' '}
        <input
          type="text"
          value={reason}
          maxLength={300}
          required
          placeholder="e.g. Goodwill compensation / Founding beta partner grant"
          onChange={(e) => setReason(e.target.value)}
          style={{ width: '100%', maxWidth: 420, marginTop: 4, display: 'block' }}
        />
      </label>

      <div style={{ background: 'rgba(15,23,42,0.04)', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 14 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>Summary</p>
        <p>
          Current: <b>{normalizedCurrent}</b> → New: <b>{plan}</b>
          {plan !== 'FREE' ? (
            <>
              {' '}for <b>{duration} days</b>, starting <b>{effStart}</b> (auto-expires back to Free when period ends).
            </>
          ) : (
            <> (revokes manual/paid access immediately and returns account to Free).</>
          )}
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I confirm this manual subscription action and understand it will be permanently audited.</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn" style={{ minHeight: 36, fontSize: 13 }} disabled={busy || !reasonValid || !confirmed} onClick={submit}>
          {busy ? 'Applying…' : 'Confirm plan change'}
        </button>
        <button type="button" className="btn-ghost" style={{ minHeight: 36, fontSize: 13 }} disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        {message && <span className="muted" style={{ fontSize: 12.5 }} role="status">{message}</span>}
      </div>
      {result && <pre style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
