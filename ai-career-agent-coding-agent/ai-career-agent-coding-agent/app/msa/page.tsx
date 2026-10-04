import { LegalPage } from '@/components/site/LegalPage';
import { SITE_URL } from '@/lib/site';

export const metadata = {
  alternates: { canonical: `${SITE_URL}/msa` },
  title: 'Master Service Agreement',
  description: 'The framework agreement for business and API customers of Jobiest.',
};

export default function MsaPage() {
  return (
    <LegalPage title="Master Service Agreement" updated="4 October 2026">
      <p>
        This Master Service Agreement (&ldquo;MSA&rdquo;) is between Phos Lab
        (&ldquo;Phos Lab&rdquo;, &ldquo;we&rdquo;) and the customer identified in the applicable
        order form (&ldquo;Customer&rdquo;). It forms the framework for business, API and
        enterprise use of Jobiest.
      </p>

      <h2>1. Agreement structure</h2>
      <p>
        This MSA, each order form, our Terms of Service and Privacy Policy (jobiest.com/terms,
        jobiest.com/privacy), and our Data Processing Agreement (jobiest.com/dpa) together form the
        agreement between the parties. On conflict, the order form prevails, then this MSA, then the
        Terms of Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        Phos Lab provides the Jobiest platform: AI-assisted job discovery, document generation (CVs,
        cover letters, interview preparation), application tracking, and, where ordered, API access
        and browser-based application submission. Application submission always requires explicit
        per-application approval by an authorised user. Features, plans and fair-use limits are
        described on our pricing page and in the applicable order form.
      </p>

      <h2>3. Customer responsibilities</h2>
      <ol>
        <li>Use the Service lawfully and in compliance with our Terms of Service.</li>
        <li>Obtain end-user consent for the personal data you upload or connect.</li>
        <li>Ensure your users comply with third-party job board and employer terms.</li>
        <li>Keep credentials and API keys confidential.</li>
        <li>Not to resell or sub-license the Service without our written agreement.</li>
      </ol>

      <h2>4. Fees, invoicing and taxes</h2>
      <p>
        Fees are as stated in the order form, billed in advance in Nigerian Naira or US Dollars as
        specified. Payments may be processed through our merchant of record or payment providers;
        the receipt identifies the seller of record. Fees are exclusive of applicable taxes.
      </p>

      <h2>5. Term and termination</h2>
      <p>
        The initial term is stated in the order form and renews as specified there until terminated
        by either party with 30 days&rsquo; written notice. Either party may terminate for material
        breach uncured within 15 days of notice. On termination, your access ends at the close of
        the paid period, you may export your data for 30 days, and we delete remaining data as
        described in our Privacy Policy and DPA.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        Phos Lab retains all rights in the Service, including software, models and documentation.
        You retain all rights in your data, including end-user documents. Each party grants the
        other only the limited rights needed to perform this agreement.
      </p>

      <h2>7. Confidentiality</h2>
      <p>
        Each party protects the other&rsquo;s non-public information with at least reasonable care
        and uses it only under this agreement. Standard exclusions apply (already public,
        independently developed, lawfully received, or required to be disclosed by law).
      </p>

      <h2>8. Data protection</h2>
      <p>The parties comply with our Data Processing Agreement (jobiest.com/dpa).</p>

      <h2>9. Warranties and disclaimers</h2>
      <p>
        We provide the Service with reasonable skill and care. Otherwise, the Service is provided
        &ldquo;as is&rdquo;. We do not guarantee that your end users will obtain interviews or
        employment, and AI-generated content is draft output subject to human review. Availability
        commitments, if any, are stated in the order form.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        Neither party is liable for indirect, incidental, special or consequential damages. Each
        party&rsquo;s aggregate liability is capped at the fees paid or payable under this agreement
        in the 12 months preceding the claim. Nothing limits liability for fraud, willful misconduct,
        or liability that cannot be limited by law.
      </p>

      <h2>11. Indemnities</h2>
      <p>
        We indemnify you against third-party claims that the Service infringes intellectual property,
        with the standard carve-outs (combinations, modifications, misuse). You indemnify us against
        claims arising from your data, your end users, or your breach of law or third-party terms.
      </p>

      <h2>12. Insurance</h2>
      <p>Each party maintains commercially reasonable insurance appropriate to its role.</p>

      <h2>13. General</h2>
      <p>
        Notices to us: support@jobiest.com. Neither party is liable for force majeure. Assignment
        requires consent except to a successor in a merger or sale of substantially all assets. If a
        term is unenforceable, the rest stands. Governing law: the Federal Republic of Nigeria.
      </p>

      <p>
        To discuss a business or API arrangement:{' '}
        <a href="mailto:support@jobiest.com">support@jobiest.com</a>.
      </p>
    </LegalPage>
  );
}
