import { LegalPage } from '@/components/site/LegalPage';
import { SITE_URL } from '@/lib/site';

export const metadata = {
  alternates: { canonical: `${SITE_URL}/privacy` },
  title: 'Privacy Policy',
  description: 'How Jobiest collects, uses and protects your data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="10 September 2026">
      <p>
        This Privacy Policy explains what information Jobiest (&ldquo;we&rdquo;, &ldquo;us&rdquo;)
        collects, how we use it, and the choices you have. It applies to all users of the Jobiest
        Service, including visitors to jobiest.com.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li><b>Account data:</b> name, email address and password (stored as a one-way hash by our auth provider).</li>
        <li><b>Profile data you provide:</b> work history, skills, education, target roles, CV text and application email addresses.</li>
        <li><b>Usage data:</b> which features you use, generation and application activity, and technical logs (IP address, browser, device).</li>
        <li><b>Payment data:</b> when you subscribe, our payment provider collects and processes payment details. We receive only a transaction reference and status — we never store your full card details.</li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To provide, operate and improve the Service (matching, generation, tracking).</li>
        <li>To manage your account, subscriptions and support requests.</li>
        <li>To protect the Service against fraud and abuse (rate limiting, device signals, audit logs).</li>
        <li>To send transactional emails (verification, password reset, receipts) and, with your consent, product updates.</li>
      </ul>

      <h2>3. Legal basis</h2>
      <p>
        We process your data on the basis of: (a) performing our contract with you; (b) our legitimate
        interests in securing and improving the Service; and (c) your consent where required. Where
        applicable law (including the Nigeria Data Protection Act and GDPR) requires, you may withdraw
        consent at any time.
      </p>

      <h2>4. How we share information</h2>
      <ul>
        <li><b>Service providers:</b> infrastructure and tooling vendors (e.g. Supabase for data storage, Vercel for hosting, Resend for email, and our payment provider). These providers process data on our behalf under contract.</li>
        <li><b>Employers:</b> only when you approve an application, we transmit the application materials you have reviewed.</li>
        <li><b>Legal obligations:</b> where required by law or to protect rights and safety.</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>5. Data retention</h2>
      <p>
        We retain account and profile data while your account is active. Generated documents and
        application records are retained as immutable, verifiable records for your use and for
        security review. You may request deletion of your account and associated data at any time;
        certain records (e.g. payment receipts) may be retained where required by law.
      </p>

      <h2>6. Security</h2>
      <p>
        We use industry-standard measures including encryption in transit and at rest, hashed
        passwords, and row-level database security. Access to personal data is restricted to
        authorised systems and personnel. No method of transmission is 100% secure, but we work to
        protect your data diligently.
      </p>

      <h2>7. International transfers</h2>
      <p>
        Our providers may process data outside your country of residence, including in jurisdictions
        with different data-protection laws. We use providers that commit to appropriate safeguards
        (for example, EU Standard Contractual Clauses) where applicable.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Depending on your location, you may have the right to access, correct, delete or export your
        data, to object to or restrict processing, and to lodge a complaint with a supervisory
        authority. To exercise any of these rights, email{' '}
        <a href="mailto:privacy@jobiest.com">privacy@jobiest.com</a>. We respond within the timeframes
        required by law.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use strictly necessary cookies for authentication and security (for example, session and
        device-identity cookies). We do not use advertising cookies or third-party ad trackers.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed to anyone under 18, and we do not knowingly collect data from
        children. If you believe a child has provided us data, contact us and we will delete it.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy. Material changes will be communicated by email or an in-product
        notice. The &ldquo;last updated&rdquo; date above reflects the current version.
      </p>

      <h2>12. Contact</h2>
      <p>
        For privacy questions or requests, contact <a href="mailto:privacy@jobiest.com">privacy@jobiest.com</a>.
      </p>
    </LegalPage>
  );
}
