import { LegalPage } from '@/components/site/LegalPage';
import { SITE_URL } from '@/lib/site';

export const metadata = {
  alternates: { canonical: `${SITE_URL}/refund` },
  title: 'Refund Policy',
  description: 'Jobiest refund policy for paid subscriptions.',
};

export default function RefundPage() {
  return (
    <LegalPage title="Refund Policy" updated="10 September 2026">
      <p>
        We want you to be confident in your purchase. This Refund Policy explains when you can request
        a refund for a Jobiest subscription. It applies to paid plans (Basic, Premium and Max) and
        supplements our Terms of Service.
      </p>

      <h2>1. Free plan</h2>
      <p>
        The free plan is free and requires no payment, so no refunds apply. New accounts start free at no charge and with no card required; Basic includes 2 auto-apply trial uses.
      </p>

      <h2>2. 7-day money-back guarantee</h2>
      <p>
        If you subscribe to a paid plan and are not satisfied, you may request a full refund within
        7 days of your first payment for that plan. To request a refund, email{' '}
        <a href="mailto:support@jobiest.com">support@jobiest.com</a> from the email address on your
        account, with the subject &ldquo;Refund request&rdquo;.
      </p>

      <h2>3. After the first 7 days</h2>
      <p>
        After the first 7 days, subscription payments are non-refundable except where required by
        law. You can cancel at any time to stop future renewals; cancellation takes effect at the end
        of the current billing period and you retain access until then.
      </p>

      <h2>4. Renewals</h2>
      <p>
        Automatic renewal payments are non-refundable except where required by law. To avoid a renewal
        charge, cancel at least one day before your renewal date from your billing page.
      </p>

      <h2>5. Failed or duplicate charges</h2>
      <p>
        If you were charged twice for the same period, or charged after you cancelled, contact{' '}
        <a href="mailto:support@jobiest.com">support@jobiest.com</a> and we will investigate and
        refund any erroneous charge.
      </p>

      <h2>6. How refunds are issued</h2>
      <p>
        Approved refunds are returned to the original payment method via our payment provider.
        Refunds are processed in the currency in which you were charged. Processing times depend on
        your bank or card issuer and typically take 5–10 business days.
      </p>

      <h2>7. Chargebacks</h2>
      <p>
        If you believe a charge is fraudulent, contact your bank. We encourage you to contact us
        first — we resolve legitimate refund requests quickly. Accounts that issue chargebacks
        without contacting us may be suspended pending review.
      </p>

      <h2>8. Currency and FX</h2>
      <p>
        Prices are set in Nigerian Naira (₦). Where prices are displayed in another currency, they
        are estimates for your convenience; the amount charged is the Naira price, and any refund is
        for the amount actually charged.
      </p>

      <h2>9. Contact</h2>
      <p>
        Refund requests and questions: <a href="mailto:support@jobiest.com">support@jobiest.com</a>.
      </p>
    </LegalPage>
  );
}
