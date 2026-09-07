'use client';

import Link from 'next/link';
import { AppShell } from '@/components/site/AppShell';

/** Payment-cancelled landing (Flutterwave redirect). No charge was made. */
export default function BillingCancelPage() {
  return (
    <AppShell active="billing" title="Billing">
      <section className="workspace-hero">
        <p className="eyebrow">PAYMENT</p>
        <h1>Payment cancelled.</h1>
        <p>No charge was made. Your free plan is untouched — pick up right where you left off.</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <Link className="btn" href="/billing">Return to billing</Link>
          <Link className="btn-ghost" href="/dashboard">Go to dashboard</Link>
        </div>
      </section>
    </AppShell>
  );
}
