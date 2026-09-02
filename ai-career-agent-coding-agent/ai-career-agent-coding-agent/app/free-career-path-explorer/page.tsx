import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { CareerPathsTool } from '@/components/freetools/CareerPathsTool';

export const metadata: Metadata = {
  title: 'Free Career Path Explorer, directions grown from your real skills',
  description:
    'Three career directions worth exploring, based only on the skills in your verified profile, each citing the exact skills it builds on. Checked, grounded, free.',
  openGraph: {
    title: 'Free Career Path Explorer · Jobiest',
    description: 'Exploratory career directions from your verified skills, nothing invented. Free to use.',
  },
};

const STEPS = [
  { n: '1', t: 'We read your skills', d: 'Only your verified profile, no assumptions about ambition or dreams.' },
  { n: '2', t: 'We map adjacencies', d: 'Realistic directions your actual skills transfer into.' },
  { n: '3', t: 'You verify', d: 'Check any path against real listings in your market before committing time.' },
];

export default async function FreeCareerPathsPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Career Path Explorer"
      lead="Three directions worth exploring, grown from the skills you actually have, every suggestion cites the skills it builds on, and a checker rejects anything your profile can't back up."
    >
      <section className="mk-section tight">
        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <CareerPathsTool signedIn={!!user} />

          <div className="ft-steps">
            {STEPS.map((s) => (
              <div className="ft-step" key={s.n}>
                <span className="ft-step-n">{s.n}</span>
                <b>{s.t}</b>
                <p>{s.d}</p>
              </div>
            ))}
          </div>

          <div className="ft-sec">
            <h2>Suggestions, not prophecies</h2>
            <p>
              No tool can guarantee a career outcome, and we won&apos;t pretend to. What we can do
              is ground every suggestion in skills you verifiably have, and be honest that the rest
              (market timing, openings, your interest) is yours to check. The &quot;explore&quot;
              items tell you where to look.
            </p>
          </div>

          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-career-path-explorer" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. It uses one of your daily AI credits, the free plan includes 2 every day, forever.</p>
              </details>
              <details>
                <summary>Why do suggestions only cite my existing skills?</summary>
                <p>Because claims about skills you don&apos;t have would be fabrication, the thing this product exists to fight. New skills appear under &quot;explore&quot;, as things to research, not as things you supposedly have.</p>
              </details>
              <details>
                <summary>Can it tell me what to do with my life?</summary>
                <p>No, and be suspicious of anything that offers to. This narrows options using evidence; the decision stays yours.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            See how your skills match real jobs.{' '}
            <Link href="/signup" className="inline-link">Start free →</Link>
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
