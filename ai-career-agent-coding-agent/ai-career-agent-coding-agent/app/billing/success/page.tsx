'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/site/AppShell';

/** Post-payment landing (Flutterwave and Paystack redirect here).
 *  Informational only: the entitlement upgrade is applied by the signed
 *  webhook, never by this page, so the browser cannot grant itself a plan.
 *  Flutterwave arrives with ?status=&tx_ref=; Paystack with
 *  ?reference=&trxref= (no status; the button asks our server, which
 *  re-verifies with Paystack before applying anything). */
function SuccessInner() {
  const params = useSearchParams();
  const status = (params.get('status') ?? '').toLowerCase();
  const txRef = params.get('tx_ref') ?? '';
  // Paystack redirect params: reference (and duplicate trxref).
  const paystackRef = params.get('reference') ?? params.get('trxref') ?? '';
  const isPaystack = !txRef && paystackRef.startsWith('pstk_');
  const reference = isPaystack ? paystackRef : txRef;
  // Flutterwave tells us the outcome in the URL; Paystack does not, so its
  // page stays neutral until the server-side check runs.
  const failed = !isPaystack && status !== '' && status !== 'success' && status !== 'successful';
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const checkPayment = async () => {
    if (!reference || checking) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch(isPaystack ? '/api/billing/paystack/verify' : '/api/billing/flutterwave/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(isPaystack ? { reference } : { tx_ref: reference }),
      });
      const out = await res.json();
      if (out.plan) setCheckResult(`Payment confirmed. ${out.plan} plan active.`);
      else if (out.status === 'not_found') setCheckResult('We could not find this transaction yet. If you were charged, it appears within a few minutes.');
      else if (out.status === 'successful' || out.status === 'success') setCheckResult('Payment confirmed.');
      else setCheckResult(`Current status: ${out.status ?? 'unknown'}. No charge means you can safely try again.`);
    } catch {
      setCheckResult('Could not reach the payment service. Please try again in a moment.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <AppShell active="billing" title="Billing">
      <section className="workspace-hero">
        <p className="eyebrow">PAYMENT</p>
        <h1>{failed ? 'Payment not completed.' : 'You’re all set.'}</h1>
        <p>
          {failed
            ? 'Your payment could not be confirmed yet. If you were charged, our team reconciles it automatically; no action needed on your side.'
            : 'Thanks for upgrading. Your plan and automation allowance are being activated on your account.'}
        </p>
        {reference && <p className="muted" style={{ fontSize: 12.5 }}>Reference: {reference}</p>}
        {reference && (
          <div style={{ marginTop: 16 }}>
            <button className="btn-ghost" onClick={checkPayment} disabled={checking} style={{ cursor: 'pointer' }}>
              {checking ? 'Checking…' : 'Check payment status'}
            </button>
            {checkResult && <p className="muted" style={{ marginTop: 10, fontSize: 13.5 }}>{checkResult}</p>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <Link className="btn" href="/dashboard">Go to dashboard</Link>
          <Link className="btn-ghost" href="/billing">View billing</Link>
        </div>
      </section>
    </AppShell>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
