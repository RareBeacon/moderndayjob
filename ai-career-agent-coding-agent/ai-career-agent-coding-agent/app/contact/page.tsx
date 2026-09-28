import { LegalPage } from '@/components/site/LegalPage';
import { SITE_URL } from '@/lib/site';

export const metadata = {
  alternates: { canonical: `${SITE_URL}/contact` },
  title: 'Contact Us',
  description: 'How to reach the Jobiest team: support, billing, privacy, and security.',
};

export default function ContactPage() {
  return (
    <LegalPage title="Contact Us" kicker="Contact">
      <p>
        The fastest way to reach us is email. We read every message and reply as quickly as we can,
        typically within two business days.
      </p>

      <h2>Support and account help</h2>
      <p>
        Questions about your account, the agent, your resume, or your applications:{' '}
        <a href="mailto:support@jobiest.com">support@jobiest.com</a>. Please send it from the email
        address on your Jobiest account so we can find it faster.
      </p>

      <h2>Billing and refunds</h2>
      <p>
        For subscription or refund questions, email{' '}
        <a href="mailto:support@jobiest.com">support@jobiest.com</a> with the subject
        &ldquo;Refund request&rdquo; (for refunds) or &ldquo;Billing&rdquo; (for anything else). See
        the <a href="/refund">refund policy</a> for the 7-day money-back guarantee and how renewals
        work.
      </p>

      <h2>Privacy</h2>
      <p>
        Privacy questions or data requests:{' '}
        <a href="mailto:privacy@jobiest.com">privacy@jobiest.com</a>. Details are in the{' '}
        <a href="/privacy">privacy policy</a>.
      </p>

      <h2>Security</h2>
      <p>
        If you have found a security issue, please email{' '}
        <a href="mailto:privacy@jobiest.com">privacy@jobiest.com</a> with the subject
        &ldquo;Security&rdquo; and we will look into it as a priority. Please do not post security
        details publicly.
      </p>

      <h2>Help centre</h2>
      <p>
        Many common questions are already answered in the <a href="/help">help centre</a>, including
        how the agent works and how to control what it does.
      </p>

      <h2>Who we are</h2>
      <p>
        Jobiest is operated by Phos Lab and built in Lagos, Nigeria. You can read more on the{' '}
        <a href="/about">about page</a>.
      </p>
    </LegalPage>
  );
}
