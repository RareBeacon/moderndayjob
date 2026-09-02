import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { SalaryInsightsTool } from '@/components/freetools/SalaryInsightsTool';

export const metadata: Metadata = {
  title: 'Free Salary Insights — only what listings actually state',
  description:
    'We read real job listings for your role and report only the pay ranges they explicitly state — no estimates, no invented market averages. Honest salary signals, free.',
  openGraph: {
    title: 'Free Salary Insights — Jobiest',
    description: 'Pay ranges as stated in real listings — nothing estimated, nothing invented. Free to use.',
  },
};

export default async function FreeSalaryInsightsPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Salary Insights"
      lead="What do employers actually say they pay? We read real listings for your role and report only the pay they explicitly state — never an estimate dressed up as data."
    >
      <section className="mk-section tight">
        <div className="mk-shell ft-split">
          <div>
            <SalaryInsightsTool signedIn={!!user} />
          </div>
          <aside className="ft-aside">
            <span className="mk-kicker">Why it&apos;s different</span>
            <ul className="ft-points">
              <li><b>Stated, not guessed</b><span>Every number comes from a listing that explicitly prints it, and cites it.</span></li>
              <li><b>No fake averages</b><span>We refuse to compute a “market rate” from silence. If listings don&apos;t say, we say that.</span></li>
              <li><b>Honest denominators</b><span>You always see how many listings were scanned vs. how many stated pay.</span></li>
            </ul>
            <p className="muted" style={{ fontSize: 14, marginTop: 18 }}>
              Most salary tools invent confident numbers from thin air. A range printed in a real
              listing is a signal; anything else is marketing.
            </p>
          </aside>
        </div>

        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-salary-insights" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. It uses one of your daily AI credits — the free plan includes 2 every day, forever.</p>
              </details>
              <details>
                <summary>Why do so few listings show a range?</summary>
                <p>Because most employers don&apos;t put pay in the listing — especially in our market. We report the silence honestly instead of papering over it with an invented average.</p>
              </details>
              <details>
                <summary>Which listings do you read?</summary>
                <p>The newest listings in your job pool whose title matches the role you enter — up to 20 per run, each result citing the listing it came from.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Bring the whole picture together.{' '}
            <Link href="/signup" className="inline-link">Start free →</Link>
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
