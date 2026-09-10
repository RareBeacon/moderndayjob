'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';

type Entitlement = {
  plan: string;
  ai_credits_remaining: number;
  applications_remaining: number;
  tool_uses_remaining: number | null;
  automation_enabled: boolean;
  subscription_status: string | null;
  trial_ends_at: string | null;
};

type PaidPlan = 'BASIC' | 'PREMIUM' | 'MAX';

const PLANS: { code: PaidPlan; name: string; price: string; blurb: string }[] = [
  {
    code: 'BASIC',
    name: 'Basic',
    price: '₦5,000 / month',
    blurb: '10 AI documents and 10 auto-apply slots a day. 50 tool uses a day.',
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    price: '₦10,000 / month',
    blurb: '20 AI documents and 20 auto-apply slots a day. Unlimited tool uses.',
  },
  {
    code: 'MAX',
    name: 'Max',
    price: '₦20,000 / month',
    blurb: '40 AI documents and 40 auto-apply slots a day. Human-reviewed applications.',
  },
];

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

  async function buy(plan: PaidPlan) {
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
        <p>Your plan, credits, and automation allowance are calculated securely on the server — not in your browser.</p>
        {entitlement && (
          <div className="usage-strip">
            <span><b>{entitlement.plan}</b> current plan</span>
            <span><b>{entitlement.ai_credits_remaining}</b> AI documents today</span>
            <span><b>{entitlement.tool_uses_remaining === null ? 'Unlimited' : entitlement.tool_uses_remaining}</b> tool uses today</span>
            <span><b>{entitlement.applications_remaining}</b> automation slots today</span>
          </div>
        )}
        {message && <p className="form-status">{message}</p>}
      </section>
      <section className="plan-grid">
        <article className="card">
          <p className="eyebrow">FREE</p>
          <h2>₦0</h2>
          <p className="muted">3 AI documents every day. All 10 career tools (10 uses a day), job matching and tracking.</p>
          <strong>Your career workspace stays yours.</strong>
        </article>
        {PLANS.map((p) => (
          <article key={p.code} className={`card${p.code === 'PREMIUM' ? ' featured-plan' : ''}`}>
            <p className="eyebrow">{p.name.toUpperCase()}</p>
            <h2>{p.price}</h2>
            <p className="muted">{p.blurb}</p>
            <button className="btn" disabled={!!loading} onClick={() => buy(p.code)}>
              {loading === p.code ? 'Preparing checkout…' : `Choose ${p.name}`}
            </button>
          </article>
        ))}
      </section>
      <p className="form-hint">
        Prices are in Naira. See <a href="/pricing" style={{ color: 'var(--brand)' }}>the public pricing page</a> for local-currency estimates and full plan details.
      </p>
    </AppShell>
  );
}
