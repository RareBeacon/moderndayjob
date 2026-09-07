'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/site/AppShell';

/** Post-payment landing (Flutterwave redirects here). Informational only:
 *  the entitlement upgrade is applied by the signed webhook, never by this
 *  page, so the browser cannot grant itself a plan. */
function SuccessInner() {
  const params = useSearchParams();
  const status = (params.get('status') ?? '').toLowerCase();
  const txRef = params.get('tx_ref') ?? '';
  const failed = status !== '' && status !== 'success' && status !== 'successful';

  return (
    <AppShell active="billing" title="Billing">
      <section className="workspace-hero">
        <p className="eyebrow">PAYMENT</p>
        <h1>{failed ? 'Payment not completed.' : 'You’re all set.'}</h1>
        <p>
          {failed
            ? 'Your payment could not be confirmed yet. If you were charged, our team reconciles it automatically — no action needed on your side.'
            : 'Thanks for upgrading. Your plan and automation allowance are being activated on your account.'}
        </p>
        {txRef && <p className="muted" style={{ fontSize: 12.5 }}>Reference: {txRef}</p>}
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
