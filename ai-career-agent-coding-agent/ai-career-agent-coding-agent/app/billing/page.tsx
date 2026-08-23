'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';

type Entitlement = {
  plan: string;
  ai_credits_remaining: number;
  applications_remaining: number;
  automation_enabled: boolean;
  subscription_status: string | null;
  trial_ends_at: string | null;
};

export default function Billing() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/entitlements')
      .then((r) => r.json())
      .then(setEntitlement)
      .catch(() => setMessage('Unable to load plan information.'));
  }, []);

  async function buy(plan: 'BASIC' | 'PREMIUM') {
    setLoading(plan);
    setMessage('');
    const r = await fetch('/api/billing/flutterwave/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const j = await r.json();
    if (j.data?.link) location.href = j.data.link;
    else setMessage(j.error === 'BILLING_NOT_CONFIGURED' ? 'Payments are not available yet. Please check back soon.' : j.error ?? 'Unable to start payment');
    setLoading('');
  }

  return (
    <AppShell active="billing" title="Billing">
      <section className="workspace-hero">
        <p className="eyebrow">PLAN &amp; USAGE</p>
        <h1>Keep control of your momentum.</h1>
        <p>Your plan, credits, and automation allowance are calculated securely on the server—not in your browser.</p>
        {entitlement && (
          <div className="usage-strip">
            <span><b>{entitlement.plan}</b> current plan</span>
            <span><b>{entitlement.ai_credits_remaining}</b> AI credits today</span>
            <span><b>{entitlement.applications_remaining}</b> automation slots today</span>
          </div>
        )}
        {message && <p className="form-status">{message}</p>}
      </section>
      <section className="plan-grid">
        <article className="card">
          <p className="eyebrow">FREE</p>
          <h2>₦0</h2>
          <p className="muted">2 AI career/document credits every day. Track applications and build your career profile.</p>
          <strong>Your career workspace stays yours.</strong>
        </article>
        <article className="card">
          <p className="eyebrow">BASIC</p>
          <h2>₦5,000 <small>/ month</small></h2>
          <p className="muted">10 automation slots per day when approved adapters and workflows are available.</p>
          <button className="btn" disabled={!!loading} onClick={() => buy('BASIC')}>{loading === 'BASIC' ? 'Preparing checkout…' : 'Choose Basic'}</button>
        </article>
        <article className="card featured-plan">
          <p className="eyebrow">PREMIUM</p>
          <h2>₦10,000 <small>/ month</small></h2>
          <p className="muted">20 automation slots per day with the same human-control and approval safeguards.</p>
          <button className="btn" disabled={!!loading} onClick={() => buy('PREMIUM')}>{loading === 'PREMIUM' ? 'Preparing checkout…' : 'Choose Premium'}</button>
        </article>
      </section>
    </AppShell>
  );
}
