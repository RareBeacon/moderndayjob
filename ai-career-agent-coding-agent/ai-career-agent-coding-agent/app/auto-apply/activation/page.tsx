'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/site/AppShell';

/**
 * Free auto-apply activation (Milestone 3, owner decision D2).
 *
 * Plain-language promise kept here and in the code: the card check costs
 * 0 naira, we never charge the card, and we never keep the ability to
 * charge it (Paystack marks it non-reusable because we do not ask for
 * recurring consent). Card details go straight to Paystack over HTTPS and
 * are never stored; we only ever see the last four digits.
 */

type ActivationState = {
  status: 'PENDING' | 'ACTIVE' | 'FAILED';
  card_last4: string | null;
  card_brand: string | null;
  bank: string | null;
  activated_at: string | null;
} | null;

function ActivationInner() {
  const params = useSearchParams();
  const returnedFromPaystack = params.get('verified') === '1';

  const [activation, setActivation] = useState<ActivationState>(undefined as unknown as ActivationState);
  const [credits, setCredits] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auto-apply/activation');
      if (!res.ok) return;
      const out = await res.json();
      setActivation(out.activation ?? null);
      setCredits(typeof out.autoApplyCredits === 'number' ? out.autoApplyCredits : null);
    } catch {
      /* status display is best-effort */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // After the Paystack redirect, give the webhook a moment, then refresh.
  useEffect(() => {
    if (!returnedFromPaystack) return;
    const t = setTimeout(() => void loadStatus(), 3000);
    return () => clearTimeout(t);
  }, [returnedFromPaystack, loadStatus]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auto-apply/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          card: {
            number: cardNumber.replace(/\s+/g, ''),
            cvv,
            expiryMonth,
            expiryYear,
            cardholderName: cardName,
          },
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.redirectUrl) {
        window.location.href = out.redirectUrl as string;
        return;
      }
      if (out.error === 'INVALID_CARD') setError('Please check the card details and try again.');
      else if (out.error === 'RATE_LIMITED') setError('Too many attempts. Please wait an hour and try again.');
      else setError('We could not start the card check right now. Please try again in a moment.');
    } catch {
      setError('We could not reach the card check service. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const cardForm = (
    <form
      className="form-stack"
      style={{ maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitting) void submit();
      }}
    >
      <label>
        Card number
        <input
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          required
        />
      </label>
      <label>
        Name on card
        <input
          autoComplete="cc-name"
          placeholder="As written on the card"
          value={cardName}
          onChange={(e) => setCardName(e.target.value)}
          required
        />
      </label>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ flex: 1 }}>
          Expiry month
          <input inputMode="numeric" placeholder="MM" value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} required />
        </label>
        <label style={{ flex: 1 }}>
          Expiry year
          <input inputMode="numeric" placeholder="YY" value={expiryYear} onChange={(e) => setExpiryYear(e.target.value)} required />
        </label>
        <label style={{ flex: 1 }}>
          CVV
          <input inputMode="numeric" placeholder="123" value={cvv} onChange={(e) => setCvv(e.target.value)} required />
        </label>
      </div>
      {error && (
        <p className="form-status" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? 'Starting the check…' : 'Verify my card'}
      </button>
      <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
        The check is run by Paystack. Your card details go straight to Paystack over a secure connection and are never stored by us.
      </p>
    </form>
  );

  return (
    <AppShell active="applications" title="Free auto-apply">
      <section className="workspace-hero">
        <p className="eyebrow">FREE AUTO-APPLY</p>
        <h1>Unlock free auto-apply</h1>
        <p>
          Auto-apply sends job applications for you automatically. Every send costs us real money, so to keep it free we make one small
          check against spam accounts: verify a real bank card.
        </p>
        <ul style={{ lineHeight: 1.8, margin: '12px 0' }}>
          <li>The check costs 0 naira. Nothing is charged, now or later.</li>
          <li>We never charge the card and we never keep the ability to charge it.</li>
          <li>We only ever see the last four digits and the bank name.</li>
          <li>Once verified, you get 5 auto-apply credits every month.</li>
        </ul>

        {activation === undefined ? (
          <p>Loading your activation status…</p>
        ) : activation?.status === 'ACTIVE' ? (
          <div>
            <p className="form-status" style={{ color: 'var(--ok, green)' }}>
              Card verified{activation.card_last4 ? ` (···· ${activation.card_last4}${activation.bank ? `, ${activation.bank}` : ''})` : ''}.
              Auto-apply is unlocked.
            </p>
            <p>
              <strong>Auto-apply credits left this month: {credits ?? '…'}</strong>
            </p>
            <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              Credits refresh with a new 5 every month. A paid plan raises the monthly allowance instead.
            </p>
          </div>
        ) : activation?.status === 'FAILED' ? (
          <div>
            <p className="form-status" role="alert">
              The last card check did not go through. No money moved. You can try again with the same card or another one.
            </p>
            {cardForm}
          </div>
        ) : returnedFromPaystack ? (
          <p>Finishing the check… this page updates in a few seconds. If it does not, refresh once.</p>
        ) : (
          cardForm
        )}
      </section>
    </AppShell>
  );
}

export default function AutoApplyActivationPage() {
  return (
    <Suspense fallback={<AppShell active="applications" title="Free auto-apply">Loading…</AppShell>}>
      <ActivationInner />
    </Suspense>
  );
}
