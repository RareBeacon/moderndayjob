'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';
import { PLANS, PAID_PLAN_ORDER, displayPlanName, type PaidPlanCode } from '@/lib/billing/pricing';
import { formatNgn, formatUsd } from '@/lib/billing/currency';

type Provider = 'paystack' | 'flutterwave' | 'dodo';

const PROVIDER_LABELS: Record<Provider, string> = {
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
  dodo: 'Dodo (Card, Global)',
};

interface EntitlementPayload {
  plan: string;
  ai_credits_remaining: number;
  tool_uses_remaining: number | null;
  applications_remaining: number;
  applications_used_this_period?: number;
  applications_monthly_limit?: number | null;
  applications_unlimited?: boolean;
  subscription_expires_at?: string | null;
  subscription_source?: string | null;
}

interface PaymentHistoryItem {
  id: string;
  provider: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface AppliedCoupon {
  code: string;
  plan: PaidPlanCode;
  currency: string;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

export default function BillingPage() {
  const [entitlement, setEntitlement] = useState<EntitlementPayload | null>(null);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [cancelledAt, setCancelledAt] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>(['paystack']);
  const [provider, setProvider] = useState<Provider>('paystack');
  const [usdMode, setUsdMode] = useState(false);
  const [loading, setLoading] = useState<string>('');
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponPlan, setCouponPlan] = useState<PaidPlanCode>('PREMIUM');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    fetch('/api/entitlements')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setEntitlement(d);
      })
      .catch(() => {});

    fetch('/api/billing/history')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.payments) setPayments(d.payments);
        if (d?.subscription?.cancelledAt) setCancelledAt(d.subscription.cancelledAt);
      })
      .catch(() => {});

    let isOutsideNg = false;
    fetch('/api/geo')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { country?: string } | null) => {
        const c = (d?.country ?? '').toUpperCase();
        isOutsideNg = c !== '' && c !== 'NG';
        setUsdMode(isOutsideNg);
      })
      .catch(() => {})
      .finally(() => {
        fetch('/api/billing/providers')
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { paystack?: boolean; flutterwave?: boolean; dodo?: boolean } | null) => {
            if (!d) return;
            const list: Provider[] = [];
            if (isOutsideNg) {
              if (d.dodo) list.push('dodo');
              if (d.paystack) list.push('paystack');
              if (d.flutterwave) list.push('flutterwave');
            } else {
              if (d.paystack) list.push('paystack');
              if (d.flutterwave) list.push('flutterwave');
              if (d.dodo) list.push('dodo');
            }
            if (list.length > 0) {
              setProviders(list);
              setProvider(list[0]);
            }
          })
          .catch(() => {});
      });
  }, []);

  function priceFor(code: PaidPlanCode): { display: string; struck?: string } {
    const plan = PLANS[code];
    const isUsd = provider === 'dodo' || (usdMode && provider !== 'flutterwave');
    const baseDisplay = isUsd ? `${formatUsd(plan.monthlyUsd)} / mo` : `${formatNgn(plan.monthlyNgn)} / mo`;
    if (!appliedCoupon || appliedCoupon.plan !== code) return { display: baseDisplay };
    const expectedCurrency = isUsd ? 'USD' : 'NGN';
    if (appliedCoupon.currency !== expectedCurrency) return { display: baseDisplay };
    const fmt = (n: number) => (appliedCoupon.currency === 'USD' ? `${formatUsd(n)} / mo` : `${formatNgn(n)} / mo`);
    return { display: fmt(appliedCoupon.finalAmount), struck: fmt(appliedCoupon.originalAmount) };
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) {
      setAppliedCoupon(null);
      setCouponMessage('');
      return;
    }
    setCouponBusy(true);
    setCouponMessage('');
    try {
      const r = await fetch('/api/billing/coupon/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, plan: couponPlan }),
      });
      const j = await r.json();
      if (j.ok) {
        setAppliedCoupon({
          code: j.code,
          plan: couponPlan,
          currency: j.currency,
          originalAmount: j.originalAmount,
          discountAmount: j.discountAmount,
          finalAmount: j.finalAmount,
        });
        const fmt = (n: number) => (j.currency === 'USD' ? formatUsd(n) : formatNgn(n));
        setCouponMessage(`Applied ${j.code} to ${PLANS[couponPlan].name}: save ${fmt(j.discountAmount)} (pay ${fmt(j.finalAmount)}).`);
      } else {
        setAppliedCoupon(null);
        setCouponMessage(j.message ?? 'Invalid or expired coupon code');
      }
    } catch {
      setAppliedCoupon(null);
      setCouponMessage('Unable to check this coupon right now.');
    } finally {
      setCouponBusy(false);
    }
  }

  async function buy(plan: PaidPlanCode) {
    setLoading(plan);
    setMessage('');
    try {
      const couponForPlan = appliedCoupon?.plan === plan ? appliedCoupon.code : undefined;
      const r = await fetch(`/api/billing/${provider}/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, ...(couponForPlan ? { couponCode: couponForPlan } : {}) }),
      });
      const j = await r.json();
      const link = j.data?.link ?? j.data?.authorization_url ?? j.data?.checkout_url;
      if (link) location.href = link;
      else setMessage(j.error === 'BILLING_NOT_CONFIGURED' ? 'Payments are not configured on this environment yet.' : j.message ?? j.error ?? 'Unable to start payment');
    } catch {
      setMessage('Unable to start payment right now. Please try again.');
    } finally {
      setLoading('');
    }
  }

  async function cancelRenewal() {
    if (cancelling) return;
    setCancelling(true);
    setMessage('');
    try {
      const r = await fetch('/api/billing/cancel', { method: 'POST' });
      const j = await r.json();
      if (j.ok) {
        setCancelledAt(new Date().toISOString());
        setMessage(
          j.activeUntil
            ? `Auto-renewal cancelled. Your paid plan stays active until ${new Date(j.activeUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
            : 'Auto-renewal cancelled.',
        );
      } else {
        setMessage(j.message ?? j.error ?? 'Unable to cancel renewal right now.');
      }
    } catch {
      setMessage('Unable to reach billing service right now.');
    } finally {
      setCancelling(false);
    }
  }

  const currentPlanLabel = entitlement ? displayPlanName(entitlement.plan) : 'Free';
  const usedApps = entitlement?.applications_used_this_period ?? 0;
  const monthlyLimit = entitlement?.applications_monthly_limit ?? null;
  const isUnlimited = Boolean(entitlement?.applications_unlimited || currentPlanLabel === 'Ultra');

  return (
    <AppShell active="billing" title="Billing">
      <section className="workspace-hero">
        <p className="eyebrow">PLAN &amp; USAGE</p>
        <h1>Keep control of your momentum.</h1>
        <p>
          Your plan, AI credits, and monthly successful-application allowance are enforced securely on the server.
          Failed, stopped, or duplicate application attempts never consume your monthly quota.
        </p>

        {entitlement && (
          <div className="usage-strip">
            <span>
              <b>{currentPlanLabel}</b> current plan
              {entitlement.subscription_source === 'ADMIN_GRANT' ? ' (Complimentary grant)' : ''}
            </span>
            <span>
              <b>
                {isUnlimited
                  ? `${usedApps} submitted · Unlimited`
                  : monthlyLimit && monthlyLimit > 0
                    ? `${usedApps} / ${monthlyLimit} used (${entitlement.applications_remaining} left)`
                    : 'Manual apply'}
              </b>{' '}
              monthly applications
            </span>
            <span>
              <b>{entitlement.ai_credits_remaining}</b>{' '}
              {currentPlanLabel === 'Free' ? 'free CV & cover letter generations left' : 'AI generations today'}
            </span>
            <span>
              <b>{entitlement.tool_uses_remaining === null ? 'Unlimited' : entitlement.tool_uses_remaining}</b> tool uses today
            </span>
            {currentPlanLabel !== 'Free' && entitlement.subscription_expires_at && (
              <span>
                <b>
                  {new Date(entitlement.subscription_expires_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </b>{' '}
                {cancelledAt ? 'access ends (renewal cancelled)' : 'active until'} ·{' '}
                {Math.max(0, Math.ceil((new Date(entitlement.subscription_expires_at).getTime() - Date.now()) / 86400000))} day(s) remaining
              </span>
            )}
          </div>
        )}

        {currentPlanLabel !== 'Free' && entitlement?.subscription_source !== 'ADMIN_GRANT' && !cancelledAt && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ minHeight: 34, padding: '5px 12px', fontSize: 12.5 }}
              disabled={cancelling}
              onClick={cancelRenewal}
            >
              {cancelling ? 'Cancelling renewal…' : 'Cancel auto-renewal at period end'}
            </button>
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
          <select
            value={couponPlan}
            onChange={(e) => {
              setCouponPlan(e.target.value as PaidPlanCode);
              setAppliedCoupon(null);
            }}
            style={{ width: 130 }}
          >
            {PAID_PLAN_ORDER.map((code) => (
              <option key={code} value={code}>
                {PLANS[code].name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost"
            style={{ minHeight: 36, padding: '6px 14px', fontSize: 13 }}
            disabled={couponBusy}
            onClick={applyCoupon}
          >
            {couponBusy ? 'Checking…' : 'Apply'}
          </button>
          {couponMessage && (
            <span className="muted" style={{ fontSize: 12 }} role="status">
              {couponMessage}
            </span>
          )}
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
          <p className="muted">{PLANS.FREE.tagline}</p>
          <ul style={{ paddingLeft: 18, fontSize: 13.5, margin: '10px 0 14px' }}>
            {PLANS.FREE.features.slice(0, 4).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <strong>Your career workspace stays yours.</strong>
        </article>

        {PAID_PLAN_ORDER.map((code) => {
          const p = PLANS[code];
          const price = priceFor(code);
          const isCurrent = currentPlanLabel.toUpperCase() === code;
          return (
            <article key={code} className={`card${p.featured ? ' featured-plan' : ''}`}>
              <p className="eyebrow">
                {p.name.toUpperCase()}
                {appliedCoupon?.plan === code ? ` · ${appliedCoupon.code}` : ''}
                {isCurrent ? ' · CURRENT' : ''}
              </p>
              <h2>
                {price.struck && <s style={{ opacity: 0.5, fontSize: '0.65em', marginRight: 6 }}>{price.struck}</s>}
                {price.display}
              </h2>
              <p className="muted">{p.tagline}</p>
              <ul style={{ paddingLeft: 18, fontSize: 13.5, margin: '10px 0 14px' }}>
                {p.features.slice(0, 5).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button className="btn" disabled={!!loading} onClick={() => buy(code)}>
                {loading === code ? 'Preparing checkout…' : isCurrent ? `Extend ${p.name}` : `Choose ${p.name}`}
              </button>
            </article>
          );
        })}
      </section>

      {payments.length > 0 && (
        <section className="card" style={{ marginTop: 24 }}>
          <p className="eyebrow">RECEIPTS &amp; BILLING HISTORY</p>
          <h2 style={{ fontSize: 18, margin: '4px 0 12px' }}>Verified payments</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(15,23,42,0.1)' }}>
                  <th style={{ padding: '8px 6px' }}>Date</th>
                  <th style={{ padding: '8px 6px' }}>Reference</th>
                  <th style={{ padding: '8px 6px' }}>Provider</th>
                  <th style={{ padding: '8px 6px' }}>Amount</th>
                  <th style={{ padding: '8px 6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pay) => (
                  <tr key={pay.id} style={{ borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
                    <td style={{ padding: '8px 6px' }}>{String(pay.createdAt ?? '').slice(0, 10)}</td>
                    <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 12.5 }}>{pay.reference}</td>
                    <td style={{ padding: '8px 6px', textTransform: 'capitalize' }}>{pay.provider}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                      {pay.currency === 'USD' ? formatUsd(pay.amount) : formatNgn(pay.amount)}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{pay.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="form-hint" style={{ marginTop: 18 }}>
        {usdMode && provider !== 'flutterwave'
          ? 'Prices are in US dollars.'
          : 'Prices are in Naira; visitors outside Nigeria can pay in US dollars on Paystack or Dodo.'}{' '}
        See <a href="/pricing" style={{ color: 'var(--brand)' }}>the public pricing page</a> for full plan details. Paid plan checkout runs on{' '}
        {providers.length === 1 ? PROVIDER_LABELS[providers[0]] : 'the provider you pick'} secure hosted pages; Jobiest never stores card numbers.
        {provider === 'dodo' && ' Dodo is the merchant of record: VAT or sales tax for your country is calculated and handled by them at checkout.'}
      </p>
    </AppShell>
  );
}
