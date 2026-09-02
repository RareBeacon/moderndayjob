import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { FollowupEmailTool } from '@/components/freetools/FollowupEmailTool';

export const metadata: Metadata = {
  title: 'Free Follow-up Email Writer, polite, honest nudges',
  description:
    'Draft a short, polite follow-up email after a job application, built only from the facts you provide. No invented names, dates, or conversations. Free.',
  openGraph: {
    title: 'Free Follow-up Email Writer · Jobiest',
    description: 'A polite follow-up drafted from your facts, nothing invented. Free to use.',
  },
};

export default async function FreeFollowupPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Follow-up Email Writer"
      lead="A short, polite nudge to a recruiter, drafted from the facts you give us, and nothing else."
    >
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
                <p>Yes. It uses one of your daily AI credits, the free plan includes 2 every day, forever.</p>
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
