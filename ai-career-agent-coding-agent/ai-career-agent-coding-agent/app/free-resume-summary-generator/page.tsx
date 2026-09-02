import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { ResumeSummaryTool } from '@/components/freetools/ResumeSummaryTool';

export const metadata: Metadata = {
  title: 'Free Resume Summary Generator, from your verified facts only',
  description:
    'Three professional resume summary options written only from your verified profile facts, checked by a truthfulness gate before you see them. Free.',
  openGraph: {
    title: 'Free Resume Summary Generator · Jobiest',
    description: 'Truthful resume summaries from your verified facts, never invented employers or metrics. Free to use.',
  },
};

const TRUTH_POINTS = [
  { t: 'Facts only', d: 'Employers, skills, schools, and numbers come from your profile, nothing else exists to the writer.' },
  { t: 'Checked before shown', d: 'A deterministic truthfulness gate verifies every claim. Failed drafts are rejected and your credit is refunded.' },
  { t: 'No buzzword soup', d: 'The writer is barred from "passionate", "results-driven", and friends. Plain, specific, professional.' },
];

export default async function FreeResumeSummaryPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Resume Summary Generator"
      lead="Three summary options for the top of your CV, written from your verified facts and checked for truthfulness before you see a single word."
    >
      <section className="mk-section tight">
        <div className="mk-shell ft-split">
          <div>
            <ResumeSummaryTool signedIn={!!user} />
          </div>
          <aside className="ft-aside">
            <span className="mk-kicker">Why it&apos;s different</span>
            <ul className="ft-points">
              {TRUTH_POINTS.map((p) => (
                <li key={p.t}>
                  <b>{p.t}</b>
                  <span>{p.d}</span>
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: 14, marginTop: 18 }}>
              Recruiters can smell a fabricated summary, invented metrics that collapse under one
              interview question. We generate the opposite: the truth, well said.
            </p>
          </aside>
        </div>

        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-resume-summary-generator" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. It uses one of your daily AI credits, the free plan includes 2 every day, forever.</p>
              </details>
              <details>
                <summary>Will it make me sound more experienced than I am?</summary>
                <p>No. Every claim is checked against your profile, and unsupported claims reject the whole draft. A summary can present your real experience well, it cannot inflate it.</p>
              </details>
              <details>
                <summary>Where do I edit the result?</summary>
                <p>Copy any option into your CV, or use the resume studio in your workspace, it keeps every version immutable so you always know what you sent.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Ready for the full CV?{' '}
            <Link href="/signup" className="inline-link">Create your free account →</Link>
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
