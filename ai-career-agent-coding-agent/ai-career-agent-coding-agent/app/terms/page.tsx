import { LegalPage } from '@/components/site/LegalPage';
import { SITE_URL } from '@/lib/site';

export const metadata = {
  alternates: { canonical: `${SITE_URL}/terms` },
  title: 'Terms of Service',
  description: 'The terms that govern your use of Jobiest.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="10 September 2026">
      <p>
        Welcome to Jobiest. These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use
        of the Jobiest website, applications and services (collectively, the &ldquo;Service&rdquo;),
        operated by Phos Lab (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By creating an
        account or using the Service you agree to these Terms. If you do not agree, do not use the
        Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        Jobiest is an AI-powered career agent. It discovers job listings, scores how well they match
        your profile, generates CVs and cover letters grounded only in the facts you provide, and —
        with your explicit approval at every step — can submit applications on your behalf. Nothing
        is fabricated on your behalf, and no application is ever submitted without your approval.
      </p>

      <h2>2. Accounts and eligibility</h2>
      <p>
        You must be at least 18 years old to use the Service. You are responsible for maintaining the
        confidentiality of your account credentials and for all activity under your account. You must
        provide accurate information and keep it current. We may suspend or terminate accounts that
        violate these Terms or that we reasonably believe pose a security risk to the Service or
        other users.
      </p>

      <h2>3. Free and paid plans</h2>
      <p>
        The Service offers a free plan and paid subscription plans (Basic, Premium and Max). Free-plan
        features and daily usage limits are described on our pricing page. Paid plans are billed
        monthly in Nigerian Naira (₦). Prices may be displayed in other currencies as an estimate;
        the amount charged is always the Naira price for the plan you select.
      </p>

      <h2>4. Subscriptions, renewal and cancellation</h2>
      <p>
        Paid subscriptions renew automatically every 30 days until cancelled. You can cancel at any
        time from your billing page; cancellation takes effect at the end of the current billing
        period, and you retain access until then. We may change plan prices with at least 14 days
        notice; the new price applies from your next renewal.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to: (a) use the Service to submit applications to employers with false or
      misleading information; (b) attempt to bypass security, rate limits or access controls; (c)
      scrape, copy or resell the Service or its content; (d) upload malicious content; or (e) use the
      Service in a way that violates applicable law or the terms of any third-party job board or
      employer.</p>

      <h2>6. Your content and data</h2>
      <p>
        You retain ownership of the information you provide (profile data, CVs, documents). You grant
        us a limited licence to store and process that information solely to provide the Service.
        We never read your email inbox, and we never share your personal data with employers except
        when you approve an application.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        The Service, its branding, and its underlying software are owned by us or our licensors. We
        grant you a personal, non-exclusive, non-transferable right to use the Service in accordance
        with these Terms.
      </p>

      <h2>8. Disclaimer of warranties</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We do not guarantee
        that the Service will be uninterrupted or error-free, that job listings will always be
        accurate or current, or that using the Service will result in employment. AI-generated content
        is based on the information you provide and must be reviewed by you before use.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for any indirect, incidental,
        special, consequential or punitive damages, or for any loss of profits, data, or
        opportunities, arising from your use of the Service. Our total liability for any claim
        relating to the Service is limited to the greater of the amount you paid us in the three
        months before the claim or ₦20,000.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate your access if you
        breach these Terms, if required by law, or to protect the Service or other users. Upon
        termination, your right to use the Service ends, subject to any rights you have under
        applicable law.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute arising
        from these Terms will be subject to the exclusive jurisdiction of the courts of Lagos,
        Nigeria.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be communicated by email
        or an in-product notice. Continued use of the Service after changes take effect constitutes
        acceptance of the updated Terms.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Contact us at <a href="mailto:support@jobiest.com">support@jobiest.com</a>.
      </p>
    </LegalPage>
  );
}
