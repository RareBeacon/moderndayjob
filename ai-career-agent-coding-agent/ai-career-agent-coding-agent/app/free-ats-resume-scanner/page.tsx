import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { FreeToolShell, RelatedTools } from '@/components/site/FreeToolShell';
import { AtsScannerTool } from '@/components/freetools/AtsScannerTool';

export const metadata: Metadata = {
  title: 'Free ATS Resume Scanner — deterministic checks, no AI credits',
  description:
    'Paste your CV and get an instant parseability score: contact details, sections, dates, action verbs, and keyword match against any job description. Deterministic checks — free, unlimited.',
  openGraph: {
    title: 'Free ATS Resume Scanner — Jobiest',
    description: 'Instant, deterministic CV parseability scan with optional keyword matching. Free to use.',
  },
};

const CHECKS = [
  { t: 'Contact details', d: 'Email and phone present and machine-readable.' },
  { t: 'Core sections', d: 'Experience, Education, Skills — headings parsers expect.' },
  { t: 'Dates & length', d: 'A timeline parsers can build, at a length recruiters read.' },
  { t: 'Action verbs', d: 'Bullets that start with what you did, not “responsible for”.' },
  { t: 'Keyword match', d: 'Optional: which key terms from the listing your CV contains.' },
];

export default async function FreeAtsScannerPage() {
  const user = await getUser();
  return (
    <FreeToolShell
      title="ATS Resume Scanner"
      lead="Paste your CV, get a parseability score in seconds — deterministic checks, a fixed public rubric, and zero AI credits. Optionally check keyword overlap against a specific listing."
    >
      <section className="mk-section tight">
        <div className="mk-shell ft-split">
          <div>
            <AtsScannerTool signedIn={!!user} />
          </div>
          <aside className="ft-aside">
            <span className="mk-kicker">What we check</span>
            <ul className="ft-points">
              {CHECKS.map((c) => (
                <li key={c.t}><b>{c.t}</b><span>{c.d}</span></li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: 14, marginTop: 18 }}>
              No black box: every finding tells you exactly what was checked and how to fix it.
              The score judges structure and parseability — never your worth as a candidate.
            </p>
          </aside>
        </div>

        <div className="mk-shell" style={{ maxWidth: 920 }}>
          <div className="ft-sec">
            <h2>More free tools</h2>
            <RelatedTools exclude="/free-ats-resume-scanner" />
          </div>

          <div className="ft-sec">
            <h2>Questions</h2>
            <div className="ft-faq">
              <details>
                <summary>Is it really free?</summary>
                <p>Yes — and unlike our AI tools, this one uses no credits at all. The checks are deterministic, so scan as often as you like.</p>
              </details>
              <details>
                <summary>Does a high score mean I&apos;ll get interviews?</summary>
                <p>No. It means your CV is well-structured and machine-parseable. Content, relevance, and luck still do the heavy lifting — anyone promising more is selling you something.</p>
              </details>
              <details>
                <summary>Do you store my CV?</summary>
                <p>No. The scan runs on the text you paste and the result is returned to you — nothing is saved.</p>
              </details>
            </div>
          </div>

          <p className="ft-cta-line">
            Want the full studio — generation, tailoring, versions?{' '}
            <Link href="/signup" className="inline-link">Start free →</Link>
          </p>
        </div>
      </section>
    </FreeToolShell>
  );
}
