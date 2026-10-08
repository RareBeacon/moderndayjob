'use client';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';

type Entitlement = {
  plan: string;
  ai_credits_remaining: number;
  applications_remaining: number;
  tool_uses_remaining: number | null;
  automation_enabled: boolean;
  subscription_status: string | null;
  trial_ends_at: string | null;
  subscription_expires_at?: string | null;
  subscription_source?: string | null;
};

type AppliedCoupon = {
  code: string;
  plan: PaidPlan;
  currency: string;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
};

type PaidPlan = 'BASIC' | 'PREMIUM' | 'MAX';
type Provider = 'flutterwave' | 'paystack' | 'dodo';

const PLANS: { code: PaidPlan; name: string; priceNgn: string; priceUsd: string; blurb: string }[] = [
  {
    code: 'BASIC',
    name: 'Basic',
    priceNgn: '₦5,000 / month',
    priceUsd: '$3.99 / month',
    blurb: '3 AI generations a day and 2 agent-mode trial runs. 50 tool uses a day.',
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    priceNgn: '₦10,000 / month',
    priceUsd: '$7.99 / month',
    blurb: '10 AI generations and 10 agent-mode applications a day. Unlimited tool uses.',
  },
  {
    code: 'MAX',
    name: 'Max',
    priceNgn: '₦20,000 / month',
    priceUsd: '$14.99 / month',
    blurb: '20 AI generations and 20 agent-mode applications a day. Concierge support.',
  },
];

const PROVIDER_LABELS: Record<Provider, string> = {
  flutterwave: 'Flutterwave',
  paystack: 'Paystack',
  dodo: 'Dodo (USD)',
};

export default function Billing() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState<Provider>('flutterwave');
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  // Nigeria pays Naira; visitors from outside Nigeria are charged USD. The
  // checkout (/api/billing/paystack/create) decides its currency from the
  // same geo header, so this display always matches the charge.
  const [usdMode, setUsdMode] = useState(false);
  // Coupon flow (server-priced): the user enters a code, the server validates
  // it and returns the trusted price; checkout then initializes with it.
  const [couponInput, setCouponInput] = useState('');
  const [couponPlan, setCouponPlan] = useState<PaidPlan>('PREMIUM');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState('');
  // Shared between the two fetches below so whichever resolves last can
  // still apply the USD-visitor default provider (Dodo: Merchant of Record,
  // so VAT/sales tax is handled by them for international checkouts).
  let usdVisitor = false;
  const providersRef = useRef<Provider[]>([]);

  useEffect(() => {
    fetch('/api/entitlements')
      .then((r) => r.json())
      .then(setEntitlement)
      .catch(() => setMessage('Unable to load plan information.'));
    fetch('/api/geo')
      .then((r) => r.json())
      .then((j: { country?: string | null }) => {
        if (j?.country && j.country !== 'NG') {
          usdVisitor = true;
          setUsdMode(true);
          setProvider((current) => (current === 'dodo' ? current : providersRef.current.includes('dodo') ? 'dodo' : current));
        }
      })
      .catch(() => {});
    fetch('/api/billing/providers')
      .then((r) => r.json())
      .then((j: { flutterwave?: boolean; paystack?: boolean; dodo?: boolean }) => {
        const available: Provider[] = [];
        if (j.flutterwave) available.push('flutterwave');
        if (j.paystack) available.push('paystack');
        if (j.dodo) available.push('dodo');
        setProviders(available);
        if (available.length > 0) setProvider(usdVisitor && available.includes('dodo') ? 'dodo' : available[0]);
      })
      .catch(() => setProviders(['flutterwave', 'paystack']));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyCoupon() {
    if (couponBusy || couponInput.trim().length < 3) return;
    setCouponBusy(true);
    setCouponMessage('');
    setAppliedCoupon(null);
    try {
      const r = await fetch('/api/billing/coupon/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: couponInput.trim(), plan: couponPlan }),
      });
      const j = await r.json();
      if (j.ok) {
        setAppliedCoupon({ code: j.code, plan: j.plan, currency: j.currency, originalAmount: j.originalAmount, discountAmount: j.discountAmount, finalAmount: j.finalAmount });
        setCouponMessage(`Coupon ${j.code} applied.`);
      } else {
        setCouponMessage(j.message ?? 'This coupon code is invalid.');
      }
    } catch {
      setCouponMessage('Unable to check this coupon right now.');
    } finally {
      setCouponBusy(false);
    }
  }

  function priceFor(plan: PaidPlan): { display: string; struck?: string } {
    if (appliedCoupon && appliedCoupon.plan === plan) {
      const symbol = appliedCoupon.currency === 'USD' ? '$' : '₦';
      return {
        display: `${symbol}${appliedCoupon.finalAmount.toLocaleString()} / month`,
        struck: `${symbol}${appliedCoupon.originalAmount.toLocaleString()} / month`,
      };
    }
    const p = PLANS.find((x) => x.code === plan)!;
    return { display: usdMode ? p.priceUsd : p.priceNgn };
  }

  async function buy(plan: PaidPlan) {
    setLoading(plan);
    setMessage('');
    const couponCode = appliedCoupon && appliedCoupon.plan === plan ? appliedCoupon.code : undefined;
    const r = await fetch(`/api/billing/${provider}/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan, couponCode }),
    });
    const j = await r.json();
    // Flutterwave returns data.link; Paystack returns data.authorization_url;
    // Dodo returns data.checkout_url.
    const link = j.data?.link ?? j.data?.authorization_url ?? j.data?.checkout_url;
    if (link) location.href = link;
    else setMessage(j.error === 'BILLING_NOT_CONFIGURED' ? 'Payments are not available yet. Please check back soon.' : j.error ?? 'Unable to start payment');
    setLoading('');
  }

  return (
    <AppShell active="billing" title="Billing">
      <section className="workspace-hero">
        <p className="eyebrow">PLAN &amp; USAGE</p>
        <h1>Keep control of your momentum.</h1>
        <p>Your plan, credits, and automation allowance are calculated securely on the server; not in your browser.</p>
        {entitlement && (
          <div className="usage-strip">
            <span><b>{entitlement.plan}</b> current plan</span>
            <span><b>{entitlement.ai_credits_remaining}</b> {entitlement.plan === 'FREE' ? 'free documents left' : 'AI generations today'}</span>
            <span><b>{entitlement.tool_uses_remaining === null ? 'Unlimited' : entitlement.tool_uses_remaining}</b> tool uses today</span>
            <span><b>{entitlement.applications_remaining}</b> {entitlement.plan === 'BASIC' ? 'trial auto-applies left' : 'automation slots today'}</span>
            {entitlement.plan !== 'FREE' && entitlement.subscription_expires_at && (
              <span>
                <b>{new Date(entitlement.subscription_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</b>{' '}
                active until · {Math.max(0, Math.ceil((new Date(entitlement.subscription_expires_at).getTime() - Date.now()) / 86400000))} day(s) remaining
              </span>
            )}
          </div>
        )}
        <div className="coupon-box" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0' }}>
          <span style={{ fontSize: 13 }}>Have a coupon?</span>
          <input
            value={couponInput}
            maxLength={32}
            placeholder="JOBIEST50"
            style={{ width: 150, textTransform: 'uppercase' }}
            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
          />
          <select value={couponPlan} onChange={(e) => { setCouponPlan(e.target.value as PaidPlan); setAppliedCoupon(null); }} style={{ width: 120 }}>
            {PLANS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <button type="button" className="btn-ghost" style={{ minHeight: 36, padding: '6px 14px', fontSize: 13 }} disabled={couponBusy} onClick={applyCoupon}>
            {couponBusy ? 'Checking…' : 'Apply'}
          </button>
          {couponMessage && <span className="muted" style={{ fontSize: 12 }} role="status">{couponMessage}</span>}
        </div>
        {message && <p className="form-status">{message}</p>}
      </section>
      {providers.length > 1 && (
        <div className="provider-toggle" role="group" aria-label="Payment provider">
          <span className="provider-toggle-label">Pay with</span>
          {providers.map((p) => (
            <button
              key={p}
              type="button"
              className={`provider-option${provider === p ? ' provider-active' : ''}`}
              onClick={() => setProvider(p)}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>
      )}
      <section className="plan-grid">
        <article className="card">
          <p className="eyebrow">FREE</p>
          <h2>{usdMode ? '$0' : '₦0'}</h2>
          <p className="muted">3 AI generations in total, free forever. All 10 career tools (10 uses a day), the application agent and tracking.</p>
          <strong>Your career workspace stays yours.</strong>
        </article>
        {PLANS.map((p) => {
          const price = priceFor(p.code);
          return (
          <article key={p.code} className={`card${p.code === 'PREMIUM' ? ' featured-plan' : ''}`}>
            <p className="eyebrow">{p.name.toUpperCase()}{appliedCoupon?.plan === p.code ? ` · ${appliedCoupon.code}` : ''}</p>
            <h2>
              {price.struck && <s style={{ opacity: 0.5, fontSize: '0.65em', marginRight: 6 }}>{price.struck}</s>}
              {price.display}
            </h2>
            <p className="muted">{p.blurb}</p>
            <button className="btn" disabled={!!loading} onClick={() => buy(p.code)}>
              {loading === p.code ? 'Preparing checkout…' : `Choose ${p.name}`}
            </button>
          </article>
          );
        })}
      </section>
      <p className="form-hint">
        {usdMode ? 'Prices are in US dollars.' : 'Prices are in Naira; visitors outside Nigeria are charged in US dollars.'} See <a href="/pricing" style={{ color: 'var(--brand)' }}>the public pricing page</a> for full plan details. Checkout is handled on {providers.length === 1 ? PROVIDER_LABELS[providers[0]] : 'the provider you pick'} secure pages; card details never touch our servers.{provider === 'dodo' && ' Dodo is the merchant of record: VAT or sales tax for your country is calculated and handled by them at checkout.'}
      </p>
    </AppShell>
  );
}
