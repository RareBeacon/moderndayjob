import Link from 'next/link';
import { Logo } from './Logo';
import type { ReactNode } from 'react';

/* FreeToolShell, marketing chrome for the public /free-* SEO tool pages.
   Shares the landing's warm design system (mk-* tokens) with a compact hero. */


export function FreeToolShell({
  eyebrow = 'Free career tool',
  title,
  lead,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="mk-header">
        <div className="mk-shell bar">
          <Link href="/"><Logo /></Link>
          <nav className="mk-nav" aria-label="Primary">
            <span className="links">
              <Link href="/#tools">Free tools</Link>
              <Link href="/#how">How it works</Link>
              <Link href="/#pricing">Pricing</Link>
            </span>
            <span className="cta">
              <Link className="mk-btn-ghost" href="/login">Sign in</Link>
              <Link className="mk-btn-accent" href="/signup">Start free</Link>
            </span>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="ft-hero">
          <div className="mk-shell">
            <span className="mk-kicker">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{lead}</p>
          </div>
        </section>
        {children}
      </main>

      <footer className="mk-footer">
        <div className="mk-shell">
          <div className="top">
            <div>
              <Logo />
              <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 12, maxWidth: 320 }}>
                The AI career agent that finds roles, prepares truthful applications, and keeps you in control.
              </p>
            </div>
            <div className="cols">
              <div>
                <h4>Free tools</h4>
                <ul>
                  <li><Link href="/free-job-description-analyzer">JD Analyzer</Link></li>
                  <li><Link href="/free-cover-letter-writer">Cover Letter Writer</Link></li>
                  <li><Link href="/free-skills-matcher">Skills Matcher</Link></li>
                  <li><Link href="/free-ats-resume-scanner">ATS Scanner</Link></li>
                  <li><Link href="/free-salary-insights">Salary Insights</Link></li>
                </ul>
              </div>
              <div>
                <h4>Product</h4>
                <ul>
                  <li><Link href="/#how">How it works</Link></li>
                  <li><Link href="/#pricing">Pricing</Link></li>
                  <li><Link href="/signup">Start free</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="bottom">
            <span>© {new Date().getFullYear()} Jobiest. All rights reserved.</span>
            <span>Built in Lagos.</span>
          </div>
        </div>
      </footer>
    </>
  );
}

/* Shared "related tools" rail used by each free-tool page. */
export function RelatedTools({ exclude }: { exclude: string }) {
  const tools = [
    { href: '/free-job-description-analyzer', name: 'Job Description Analyzer', desc: 'Break any listing into skills, keywords, and gaps.' },
    { href: '/free-cover-letter-writer', name: 'Cover Letter Writer', desc: 'A truthful letter from your verified profile facts.' },
    { href: '/free-skills-matcher', name: 'Skills Matcher', desc: 'See which of your skills a job actually rewards.' },
    { href: '/free-interview-question-generator', name: 'Interview Question Generator', desc: 'Practice questions from the real listing.' },
    { href: '/free-resume-summary-generator', name: 'Resume Summary Generator', desc: 'Three truthful summary options, facts only.' },
    { href: '/free-linkedin-headline-builder', name: 'LinkedIn Headline Builder', desc: 'Honest, buzzword-free headline options.' },
    { href: '/free-ats-resume-scanner', name: 'ATS Resume Scanner', desc: 'Deterministic parseability checks, no credits.' },
    { href: '/free-follow-up-email-writer', name: 'Follow-up Email Writer', desc: 'A polite nudge from facts you provide.' },
    { href: '/free-career-path-explorer', name: 'Career Path Explorer', desc: 'Directions grown from your real skills.' },
    { href: '/free-salary-insights', name: 'Salary Insights', desc: 'Only what listings actually state.' },
  ].filter((t) => t.href !== exclude);
  return (
    <div className="ft-related">
      {tools.slice(0, 4).map((t) => (
        <Link className="ft-rel" href={t.href} key={t.href}>
          <b>{t.name}</b>
          <span>{t.desc}</span>
        </Link>
      ))}
    </div>
  );
}
