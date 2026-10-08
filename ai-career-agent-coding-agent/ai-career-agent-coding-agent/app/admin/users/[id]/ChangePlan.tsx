'use client';

import { useState } from 'react';

/**
 * Admin → user → Change Plan (spec Part 3/4/6/26).
 * Everything is confirmed with a summary before submission; the server is
 * the source of truth for the resulting dates (shown here as an estimate).
 */
const PLANS = ['FREE', 'BASIC', 'PREMIUM', 'MAX'] as const;
type Plan = (typeof PLANS)[number];

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

export default function ChangePlan({ userId, current }: { userId: string; current: CurrentSubscription }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>((current.plan as Plan) ?? 'FREE');
  const [duration, setDuration] = useState(30);
  const [startMode, setStartMode] = useState<'IMMEDIATELY' | 'AFTER_CURRENT'>('IMMEDIATELY');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const activePaid = ['BASIC', 'PREMIUM', 'MAX'].includes(current.plan) && (current.status ?? '').startsWith('ACTIVE');
  const effStart = startMode === 'AFTER_CURRENT' && activePaid ? fmt(current.current_period_end) : 'today';

  async function submit() {
    if (busy) return;
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
          reason: reason || undefined,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        setResult(j.result);
        setMessage('Done.');
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
        Change plan
      </button>
    );
  }

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 16, marginTop: 10 }}>
      <p style={{ fontWeight: 600, marginBottom: 10 }}>Change plan</p>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {PLANS.map((p) => (
          <label key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="radio" name="admin-plan" checked={plan === p} onChange={() => setPlan(p)} />
            {p === 'FREE' ? 'Free (cancel paid)' : p.charAt(0) + p.slice(1).toLowerCase()}
          </label>
        ))}
      </div>

      {plan !== 'FREE' && (
        <>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
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

      <label style={{ display: 'block', fontSize: 13, marginBottom: 14 }}>
        Reason (optional):{' '}
        <input
          type="text"
          value={reason}
          maxLength={300}
          placeholder="Beta tester promotion"
          onChange={(e) => setReason(e.target.value)}
          style={{ width: 260, marginLeft: 6 }}
        />
      </label>

      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 14 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>Confirm</p>
        <p>
          Current: <b>{current.plan}</b> → New: <b>{plan}</b>
          {plan !== 'FREE' && (
            <>
              {' '}for <b>{duration} days</b>, starting <b>{effStart}</b>
              {startMode === 'AFTER_CURRENT' && activePaid && current.current_period_end && (
                <> (active from {fmt(current.current_period_end)}, ends ~{fmt(new Date(new Date(current.current_period_end).getTime() + duration * 86400000).toISOString())})</>
              )}
              {plan === current.plan && startMode === 'IMMEDIATELY' && activePaid && ' (extends the current period)'}
            </>
          )}
          {plan === 'FREE' && ' (paid access ends now; history is kept)'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn" style={{ minHeight: 36, fontSize: 13 }} disabled={busy} onClick={submit}>
          {busy ? 'Applying…' : plan === 'FREE' ? 'Confirm: return to Free' : 'Confirm upgrade'}
        </button>
        <button className="btn-ghost" style={{ minHeight: 36, fontSize: 13 }} disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        {message && <span className="muted" style={{ fontSize: 12 }} role="status">{message}</span>}
      </div>
      {result && (
        <pre className="ad-mono" style={{ fontSize: 11, marginTop: 10, opacity: 0.75 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
