import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { softwareAppJsonLd, faqJsonLd, jsonLdTag } from '@/lib/seo';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { FollowupEmailTool } from '@/components/freetools/FollowupEmailTool';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/free-follow-up-email-writer` },
  title: 'Follow-Up Email Writer After a Job Application (Free)',
  description:
    'Draft a short, polite follow-up email after a job application, built only from the facts you provide. No invented names, dates, or conversations. Free.',
  openGraph: {
    title: 'Free Follow-up Email Writer · Jobiest',
    images: ['/images/og-card.jpg'],
    description: 'Write a polite, professional follow-up email for your job application, grounded in your actual application history, ready to send. Free.',
  },
};

export default async function FreeFollowupPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Follow-up Email Writer"
      lead="A short, polite nudge to a recruiter, drafted from the facts you give us, and nothing else."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(softwareAppJsonLd('Free Follow-up Email Writer', 'Draft a short, polite follow-up email after a job application, built only from the facts you provide. No invented names, dates, or conversations. Free.', '/free-follow-up-email-writer'))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(faqJsonLd([
    { q: "What does the follow-up email writer produce?", a: "A short, polite follow-up email you can send after a job application, referencing the real role and your actual application details." },
    { q: "When should I follow up on a job application?", a: "Most recruiters suggest roughly one to two weeks after applying. The writer keeps the tone professional and the ask simple \u2014 a status check, never pressure." },
    { q: "Is it free?", a: "Yes, the follow-up email is free to generate. A free account unlocks copying, downloading and saving." },
      ]))} />
      <section className="mk-section tight">
        <div className="mk-shell" style={{ maxWidth: 860 }}>
          <FollowupEmailTool signedIn={!!user} />
        </div>

        <div className="ft-band">
          <div className="mk-shell ft-band-grid">
            <div>
              <span className="mk-kicker">The honest nudge</span>
              <h2>Follow up without the cringe.</h2>
              <p>
                A good follow-up is short, specific, and pressure-free. Ours is drafted only from
                what you tell us, the company, the role, when you applied, so it never invents a
                conversation that didn&apos;t happen or a name you don&apos;t know.
              </p>
            </div>
            <ul className="ft-points">
              <li><b>Under 150 words</b><span>Respect for a busy recruiter&apos;s inbox.</span></li>
              <li><b>One clear ask</b><span>A status update, not a plea, not a pitch.</span></li>
              <li><b>You review first</b><span>Read it, make it sound like you, then send.</span></li>
            </ul>
          </div>
        </div>

        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-follow-up-email-writer" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. It uses your free career-tool allowance; 10 uses a day on the free plan, forever.</p>
              </details>
              <details>
                <summary>When should I follow up?</summary>
                <p>One follow-up after roughly a week is reasonable for most roles. Two is the ceiling. More than that hurts you.</p>
              </details>
              <details>
                <summary>Can it reference my interview or a call?</summary>
                <p>Only if you tell it to, use the optional note field. It will never invent events on its own.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Tracking applications anyway?{' '}
            <Link href="/signup" className="inline-link">Start free →</Link>{' '}
            and draft follow-ups straight from your tracker.
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
