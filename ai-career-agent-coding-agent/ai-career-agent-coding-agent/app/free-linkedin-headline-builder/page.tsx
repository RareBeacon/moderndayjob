import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { LinkedInHeadlineTool } from '@/components/freetools/LinkedInHeadlineTool';

export const metadata: Metadata = {
  title: 'Free LinkedIn Headline Builder — honest, buzzword-free options',
  description:
    'Five LinkedIn headline options built from your verified profile facts — role-first, skills-first, and a plain conservative one. Truthfulness-checked. Free.',
  openGraph: {
    title: 'Free LinkedIn Headline Builder — Jobiest',
    description: 'Headlines from your verified facts — no buzzword stacking, no emojis. Free to use.',
  },
};

export default async function FreeLinkedInHeadlinePage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="LinkedIn Headline Builder"
      lead="Five headline options from your verified profile facts — varied angles, no buzzword stacking, checked for truthfulness before you see them."
    >
      <section className="mk-section tight">
        <div className="mk-shell" style={{ maxWidth: 860 }}>
          <LinkedInHeadlineTool signedIn={!!user} />
        </div>

        <div className="ft-band">
          <div className="mk-shell ft-band-grid">
            <div>
              <span className="mk-kicker">Honest headlines</span>
              <h2>Your headline is a claim.</h2>
              <p>
                &quot;AI-Powered Growth Ninja 🚀&quot; tells recruiters nothing and collapses under
                scrutiny. Every option here is built from facts in your profile and verified before it
                reaches you — so what your headline says, you can back up.
              </p>
            </div>
            <ul className="ft-points">
              <li><b>Five varied angles</b><span>Role-first, skills-first, and one plain and conservative.</span></li>
              <li><b>Under 120 characters</b><span>Short enough to read in a search result.</span></li>
              <li><b>Zero emojis, zero jargon</b><span>The writer is barred from stacking buzzwords.</span></li>
            </ul>
          </div>
        </div>

        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-linkedin-headline-builder" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. It uses one of your daily AI credits — the free plan includes 2 every day, forever.</p>
              </details>
              <details>
                <summary>Why no keywords like "Open to Work"?</summary>
                <p>Those are LinkedIn settings, not headline content — and this tool only writes from your verified facts. Add availability signals on LinkedIn itself.</p>
              </details>
              <details>
                <summary>Can I use it without a profile?</summary>
                <p>You need at least some profile facts — that is where the truth comes from. Add your experience under Profile first; it takes a few minutes.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Make the whole profile work together.{' '}
            <Link href="/signup" className="inline-link">Start free →</Link>{' '}
            — headline, CV, and applications from one set of verified facts.
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
