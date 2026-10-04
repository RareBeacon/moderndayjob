import { LegalPage } from '@/components/site/LegalPage';
import { SITE_URL } from '@/lib/site';

export const metadata = {
  alternates: { canonical: `${SITE_URL}/dpa` },
  title: 'Data Processing Agreement',
  description: 'How Jobiest processes personal data on behalf of business customers and partners.',
};

export default function DpaPage() {
  return (
    <LegalPage title="Data Processing Agreement" updated="4 October 2026">
      <p>
        This Data Processing Agreement (&ldquo;DPA&rdquo;) is entered into between Phos Lab
        (&ldquo;Processor&rdquo;, &ldquo;we&rdquo;) and the customer or partner identified in the
        applicable order form, agreement or platform terms (&ldquo;Customer&rdquo;, &ldquo;you&rdquo;).
        It applies where we process personal data on your behalf in providing the Jobiest platform,
        API or related services, and is incorporated into the governing agreement between us.
      </p>

      <h2>1. Roles</h2>
      <p>
        You are the controller (or, where you are yourself a processor, you pass on the
        controller&rsquo;s instructions). We are the processor. Each party complies with the Nigeria
        Data Protection Act 2023 and, where applicable, the EU/UK GDPR.
      </p>

      <h2>2. Processing details</h2>
      <ul>
        <li><b>Subject matter:</b> AI career-agent services (job matching, document generation, application assistance) provided to your end users.</li>
        <li><b>Categories of data subjects:</b> your end users (job seekers).</li>
        <li><b>Categories of personal data:</b> names, contact details, career documents (CVs, cover letters), target-role preferences, application records, usage metadata.</li>
        <li><b>Purposes:</b> solely to deliver the Services under your documented instructions.</li>
        <li><b>Duration:</b> the term of the governing agreement, plus the deletion or return wind-down below.</li>
      </ul>

      <h2>3. Our obligations</h2>
      <ol>
        <li>We process personal data only on your documented instructions, including as to international transfers, unless required by law (and then with prior notice where lawful).</li>
        <li>Persons authorised to process data are bound by confidentiality.</li>
        <li>We implement the technical and organisational measures in Schedule B.</li>
        <li>We engage subprocessors only under written contracts imposing the same protections, from the list in Schedule A. We give at least 30 days&rsquo; notice of new subprocessors; you may object on reasonable data-protection grounds.</li>
        <li>We assist you, so far as possible, with data-subject requests, data-protection impact assessments and regulator enquiries.</li>
        <li>We notify you without undue delay, and in any event within 72 hours, of becoming aware of a personal data breach, with known details and remediation status.</li>
        <li>On termination, we delete or return personal data within 30 days, except where retention is required by law.</li>
        <li>We make available information reasonably necessary to demonstrate compliance, including an annual security questionnaire and, for cause, a supervised audit with 30 days&rsquo; notice.</li>
      </ol>

      <h2>4. International transfers</h2>
      <p>
        Where personal data is transferred outside Nigeria (or the EEA/UK), transfers rely on
        adequate contractual clauses with the recipient provider. Current processing regions are
        listed in Schedule A.
      </p>

      <h2>5. Term</h2>
      <p>
        This DPA runs alongside the governing agreement and survives until all personal data has
        been deleted or returned.
      </p>

      <h2>Schedule A: subprocessors (as at 4 October 2026)</h2>
      <ul>
        <li><b>Vercel Inc.</b> &mdash; application hosting (global, EU/US)</li>
        <li><b>Supabase</b> &mdash; database and authentication (US/EU)</li>
        <li><b>Resend Inc</b> &mdash; transactional email (US/EU)</li>
        <li><b>Render Inc</b> &mdash; browser automation worker (EU, Frankfurt)</li>
        <li><b>Oracle Corporation</b> &mdash; compute and storage (US/EU)</li>
        <li><b>Paddle.com / Creem</b> (as active) &mdash; merchant of record (EU)</li>
        <li><b>Paystack / Flutterwave</b> (as active) &mdash; payment processing (Nigeria)</li>
      </ul>

      <h2>Schedule B: security measures</h2>
      <ul>
        <li>Encryption in transit (TLS 1.2+) for all user-facing traffic; encryption at rest for secrets and AI provider keys (AES-256-GCM).</li>
        <li>Role-based access control with row-level security (RLS) policies at the database layer; least-privilege service roles.</li>
        <li>Audit logging of administrative actions and security-relevant events.</li>
        <li>Rate limiting and abuse protection on all public endpoints.</li>
        <li>Isolated execution: browser automation runs in a dedicated worker without database master credentials.</li>
        <li>No credentials in source control; environment-scoped secrets.</li>
        <li>Scheduled dependency and security updates; documented incident-response procedure.</li>
        <li>Anonymised backups rotated on a 30-day cycle.</li>
      </ul>

      <p>
        Questions about this DPA: <a href="mailto:support@jobiest.com">support@jobiest.com</a>.
      </p>
    </LegalPage>
  );
}
