import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { CoverLetterTool } from '@/components/freetools/CoverLetterTool';

export const metadata: Metadata = {
  title: 'Free Cover Letter Writer — truthful letters from your real profile',
  description:
    'Generate a concise, professional cover letter built only from your verified profile facts. A built-in truthfulness checker rejects any claim your profile can’t support. Free.',
  openGraph: {
    title: 'Free Cover Letter Writer — Jobiest',
    description:
      'A truthful cover letter from your verified facts — never invented employers, metrics, or skills. Free to use.',
  },
};

const TRUTH_POINTS = [
  { t: 'Truthful by design', d: 'A deterministic checker rejects any employer, metric, or skill your profile can’t support. If it isn’t true, it doesn’t ship.' },
  { t: 'Versioned & traceable', d: 'Every letter you keep is stored as an immutable version — you can always prove exactly what you sent.' },
  { t: 'Yours, not a template', d: 'Built from your experience and voice, not a generic fill-in-the-blanks template recruiters have seen a thousand times.' },
];

export default async function FreeCoverLetterPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="Cover Letter Writer"
      lead="A concise, professional cover letter written from your verified profile facts — checked for truthfulness before it’s saved."
    >
      {/* Composition B: split — tool left, truth points right */}
      <section className="mk-section tight">
        <div className="mk-shell ft-split">
          <div>
            <CoverLetterTool signedIn={!!user} />
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
              Most AI writers invent impressive-sounding details. Recruiters notice — and it can cost you
              the offer, or worse. We built the opposite: a writer that can only use what&apos;s true.
            </p>
          </aside>
        </div>

        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-cover-letter-writer" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes. It uses one of your daily AI credits — the free plan includes 2 every day, forever.</p>
              </details>
              <details>
                <summary>Can it invent achievements to make me sound better?</summary>
                <p>Deliberately not. A deterministic truthfulness checker verifies the draft against your profile, and unsupported claims cause the letter to be rejected before it&apos;s saved.</p>
              </details>
              <details>
                <summary>Can I tailor it to a specific job?</summary>
                <p>Yes — save the job in your workspace (it takes a click from the job browser), then tailor from the resume studio. This free page writes the general version.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Ready for the full studio?{' '}
            <Link href="/signup" className="inline-link">Create your free account →</Link>
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
