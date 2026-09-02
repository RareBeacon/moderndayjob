import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { SkillsMatcherTool } from '@/components/freetools/SkillsMatcherTool';

export const metadata: Metadata = {
  title: 'Free Skills Matcher — see which of your skills a job rewards',
  description:
    'Score the jobs in your pool against your real profile with explainable results: fit score, strengths, gaps, and the reasons — not a black box. Free.',
  openGraph: {
    title: 'Free Skills Matcher — ModernJob',
    description:
      'Explainable job matching: fit scores with the exact reasons — strengths, gaps, and the skills that matter. Free to use.',
  },
};

export default async function FreeSkillsMatcherPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Skills Matcher"
      lead="See which of your skills a job actually rewards — with the fit score, the strengths, and the gaps explained, not a black-box number."
    >
      {/* Composition C: centered tool, editorial differentiator band below */}
      <section className="mk-section tight">
        <div className="mk-shell" style={{ maxWidth: 860 }}>
          <SkillsMatcherTool signedIn={!!user} />
        </div>

        <div className="ft-band">
          <div className="mk-shell ft-band-grid">
            <div>
              <span className="mk-kicker">Explainable matching</span>
              <h2>No black-box scores.</h2>
              <p>
                Every match shows the fit percentage and the exact reasons — strengths, gaps, and the skills
                that matter for that role. Jobs you&apos;ve already applied to are excluded automatically,
                so you never waste a step.
              </p>
            </div>
            <ul className="ft-points">
              <li><b>Against your real profile</b><span>Skills and experience you verified — nothing else.</span></li>
              <li><b>Deterministic exclusions</b><span>Already-applied and out-of-preference jobs are filtered before scoring.</span></li>
              <li><b>Honest about gaps</b><span>You see what&apos;s missing, so you can decide whether to apply or prepare.</span></li>
            </ul>
          </div>
        </div>

        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-skills-matcher" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. A matching run uses one of your daily AI credits — the free plan includes 2 every day, forever.</p>
              </details>
              <details>
                <summary>Where do the jobs come from?</summary>
                <p>Your job pool: normalized listings from supported public sources, de-duplicated, and linked to real sources — never fabricated.</p>
              </details>
              <details>
                <summary>Does it apply for me?</summary>
                <p>Not without you. Approval mode is the default — the agent prepares, you review and release. Nothing is ever sent automatically.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Want matches while you sleep?{' '}
            <Link href="/signup" className="inline-link">Start free →</Link>{' '}
            and let your AI career agent keep scoring new roles for you.
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
