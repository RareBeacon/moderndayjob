import Link from 'next/link';
import type { CSSProperties } from 'react';
import { FAQ } from '@/components/site/FAQ';

function Logo() {
  return (
    <span className="mk-logo">
      <span className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 16 L9 9 L13 13 L20 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="5" r="2.1" fill="currentColor" />
        </svg>
      </span>
      ModernJob
    </span>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Header */}
      <header className="mk-header">
        <div className="mk-shell bar">
          <Link href="/"><Logo /></Link>
          <nav className="mk-nav" aria-label="Primary">
            <span className="links">
              <Link href="/#how">How it works</Link>
              <Link href="/#pricing">Pricing</Link>
              <Link href="/#faq">FAQ</Link>
            </span>
            <span className="cta">
              <Link className="mk-btn-ghost" href="/login">Sign in</Link>
              <Link className="mk-btn-accent" href="/signup">Start free</Link>
            </span>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mk-hero">
          <div className="mk-shell grid">
            <div>
              <span className="mk-eyebrow"><span className="pulse" /> Your AI career agent is working</span>
              <h1>
                Your next role, <em>found and applied</em> — while you do something else.
              </h1>
              <p className="lead">
                ModernJob discovers jobs that genuinely fit, scores them against your real profile,
                tailors a truthful CV and cover letter, and prepares every application for your approval.
                You stay in control. The busywork disappears.
              </p>
              <div className="actions">
                <Link className="mk-btn-accent" href="/signup">Build My Free CV</Link>
                <Link className="mk-btn-ghost" href="/#how">See How It Works</Link>
              </div>
              <div className="trust">
                <span><b>Free forever</b> · 2 AI credits/day</span>
                <span><b>Truthful</b> · only your verified facts</span>
                <span><b>You approve</b> every application</span>
              </div>
            </div>

            <div className="mk-floats">
              <div className="mk-panel">
                <div className="mk-panel-head">
                  <span className="dot" />
                  <strong>Career agent · live</strong>
                  <span className="pill">Approval mode</span>
                </div>
                <div className="mk-rail">
                  <span className="fill" aria-hidden="true" />
                  <div className="mk-step done"><span className="node">✓</span><span className="label">Job found</span><span className="meta">Senior Engineer · Remote</span></div>
                  <div className="mk-step done"><span className="node">✓</span><span className="label">Matched · 92%</span><span className="meta">7 of 8 skills</span></div>
                  <div className="mk-step done"><span className="node">✓</span><span className="label">CV tailored</span><span className="meta">ATS-ready</span></div>
                  <div className="mk-step active"><span className="node">•</span><span className="label">Application ready</span><span className="meta">Awaiting you</span></div>
                  <div className="mk-step todo"><span className="node" /><span className="label">Submitted</span><span className="meta">—</span></div>
                </div>
                <div className="mk-panel-foot">
                  <div className="mk-stat"><b>12</b><span>new matches today</span></div>
                  <div className="mk-stat"><b>4</b><span>applications prepared</span></div>
                  <div className="mk-stat"><b>92%</b><span>avg. fit score</span></div>
                </div>
              </div>
              <span className="chip mint f1">✓ Facts verified</span>
              <span className="chip cobalt f2">+ Cover letter drafted</span>
            </div>
          </div>
        </section>

        {/* Career identity */}
        <section className="mk-section">
          <div className="mk-shell mk-identity">
            <div className="copy">
              <span className="mk-kicker">Your career identity</span>
              <h2>Build your profile once. We do the rest.</h2>
              <p>
                Tell us your experience, skills, and goals in a guided flow — for any profession, not just
                engineering. Your profile becomes the single source of truth that powers every CV, match, and
                application. No exaggeration. No fabrication. Just your real story, applied precisely.
              </p>
              <ul className="points">
                <li><span className="ic">1</span><span><b>Profession-agnostic</b><br /><span>Engineers, designers, marketers, accountants, founders — all welcome.</span></span></li>
                <li><span className="ic">2</span><span><b>Verified facts only</b><br /><span>We never invent employers, metrics, or credentials you don’t have.</span></span></li>
                <li><span className="ic">3</span><span><b>Reused everywhere</b><br /><span>One profile fuels matching, CVs, cover letters, and answers.</span></span></li>
              </ul>
            </div>
            <div className="mk-pcard">
              <div className="row">
                <span className="mk-avatar">AL</span>
                <div>
                  <h3>Ada Lovelace</h3>
                  <p className="sub">Senior Product Designer · Lagos</p>
                </div>
              </div>
              <div className="mk-meter" style={{ '--w': '88%' } as CSSProperties}>
                <div className="top"><span>Profile strength</span><span>88%</span></div>
                <div className="bar"><i /></div>
              </div>
              <div className="mk-tags">
                <span>Figma</span><span>Design systems</span><span>User research</span><span>Prototyping</span><span>Strategy</span>
              </div>
            </div>
          </div>
        </section>

        {/* Resume transformation */}
        <section className="mk-section" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell mk-studio">
            <div className="mk-doc" aria-hidden="true">
              <span className="score-tag">92 ATS</span>
              <div className="dline h" />
              <div className="dline w90" />
              <div className="dline w70" />
              <div className="dline w40" />
              <div style={{ height: 14 }} />
              <div className="dline w70" />
              <div className="dline w90" />
              <div className="dline w40" />
              <div style={{ height: 12 }} />
              <div className="ats"><i className="on" /><i className="on" /><i className="on" /><i className="on" /><i /></div>
            </div>
            <div className="copy">
              <span className="mk-kicker">Resume studio</span>
              <h2>A document studio — not a text box.</h2>
              <p>
                Paste a job description and watch your CV reshape to it: keywords aligned, achievements
                repositioned, an ATS score applied. Every edit is grounded in your real profile and kept as an
                immutable version, so you can always prove what you sent.
              </p>
              <ul className="points" style={{ marginTop: 22 }}>
                <li><span className="ic">✓</span><span><b>Truthful by design</b><br /><span>A built-in checker rejects any claim your profile can’t support.</span></span></li>
                <li><span className="ic">✓</span><span><b>Versioned & traceable</b><br /><span>Every generation is an immutable, hashable record.</span></span></li>
              </ul>
              <div style={{ marginTop: 26 }}><Link className="mk-btn-primary" href="/signup">Try the resume studio</Link></div>
            </div>
          </div>
        </section>

        {/* Job matching */}
        <section className="mk-section">
          <div className="mk-shell mk-match-wrap">
            <div>
              <span className="mk-kicker">Why this job?</span>
              <h2 style={{ fontSize: 'var(--fs-h2)', letterSpacing: '-0.03em', fontWeight: 800, color: 'var(--brand-ink)', margin: '14px 0 0' }}>
                Matching that actually explains itself.
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.65, marginTop: 16 }}>
                No black-box scores. For every job you see a clear fit percentage and the exact reasons —
                strengths, gaps, and the skills that matter. Jobs you’ve already applied to are automatically
                excluded, so you never waste a step.
              </p>
            </div>
            <div className="mk-match">
              <div className="top">
                <span className="mk-ring" style={{ '--p': '92%' } as CSSProperties}><span className="inner">92</span></span>
                <div>
                  <span className="mk-co">N</span>
                </div>
                <div>
                  <h3>Senior Product Designer</h3>
                  <p className="loc">Northwind · Remote · $90–120k</p>
                  <p className="why">“You’re a strong match because…”</p>
                </div>
              </div>
              <div className="mk-reasons">
                <div className="r"><span className="ok">✓</span> Design systems <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>8 yrs</span></div>
                <div className="r"><span className="ok">✓</span> User research & prototyping</div>
                <div className="r"><span className="ok">✓</span> 7 of 8 listed skills</div>
                <div className="r"><span className="gap">~</span> Slight gap: B2B SaaS at scale</div>
              </div>
            </div>
          </div>
        </section>

        {/* Automation workflow */}
        <section className="mk-section" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">Application automation</span>
              <h2>Meet your AI career employee.</h2>
              <p>From discovery to submission, the agent moves your applications forward — and pauses for your approval at every step that matters.</p>
            </div>
            <div className="mk-flow">
              <div className="stage done"><span className="badge">Done</span><div className="num">01</div><h3>Discovering</h3><p>Scans job sources for roles that fit your targets.</p></div>
              <div className="stage done"><span className="badge">Done</span><div className="num">02</div><h3>Analyzing</h3><p>Scores fit and flags gaps against your real profile.</p></div>
              <div className="stage live"><span className="badge">Live</span><div className="num">03</div><h3>Tailoring</h3><p>Drafts a truthful CV, cover letter, and answers.</p></div>
              <div className="stage"><span className="badge" style={{ background: 'var(--line-2)', color: 'var(--muted)' }}>You</span><div className="num">04</div><h3>Submitting</h3><p>You review, approve, and we submit — verifiably.</p></div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mk-section" id="how">
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">How it works</span>
              <h2>Three steps to momentum.</h2>
            </div>
            <div className="mk-how">
              <div className="step"><div className="n">1</div><h3>Build your profile</h3><p>A guided flow captures your experience, skills, and the roles you want. Any profession.</p></div>
              <div className="step"><div className="n">2</div><h3>Let the agent work</h3><p>It discovers jobs, scores fit, and prepares truthful, tailored applications for you.</p></div>
              <div className="step"><div className="n">3</div><h3>Approve & track</h3><p>Review each application, approve in a click, and watch every status update in one place.</p></div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="mk-section" id="pricing" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">Pricing</span>
              <h2>Start free. Upgrade when you’re ready to automate.</h2>
              <p>Prices in Naira. Cancel anytime.</p>
            </div>
            <div className="mk-price-grid">
              <div className="mk-plan">
                <h3>Free</h3>
                <div className="price">₦0<small> /month</small></div>
                <ul>
                  <li>2 AI career credits / day</li>
                  <li>CV builder & ATS tools</li>
                  <li>Job analysis & matching</li>
                  <li>Application tracking</li>
                </ul>
                <Link className="mk-btn-ghost" href="/signup" style={{ textAlign: 'center' }}>Start free</Link>
              </div>
              <div className="mk-plan featured">
                <h3>Basic</h3>
                <div className="price">₦5,000<small> /month</small></div>
                <ul>
                  <li>Everything in Free</li>
                  <li>Application automation</li>
                  <li>10 applications / day</li>
                  <li>Approval-mode workflow</li>
                </ul>
                <Link className="mk-btn-accent" href="/signup" style={{ textAlign: 'center' }}>Choose Basic</Link>
              </div>
              <div className="mk-plan">
                <h3>Premium</h3>
                <div className="price">₦10,000<small> /month</small></div>
                <ul>
                  <li>Everything in Basic</li>
                  <li>20 applications / day</li>
                  <li>Advanced intelligence</li>
                  <li>Priority processing</li>
                </ul>
                <Link className="mk-btn-ghost" href="/signup" style={{ textAlign: 'center' }}>Choose Premium</Link>
              </div>
            </div>
            <p className="mk-trial"><b>7-day automation trial</b> on every new account — try Basic features free, no card required.</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mk-section tight" id="faq">
          <div className="mk-shell" style={{ maxWidth: 820 }}>
            <div className="mk-sec-head center">
              <span className="mk-kicker">FAQ</span>
              <h2>Questions, answered.</h2>
            </div>
            <div style={{ marginTop: 36 }}><FAQ /></div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mk-section tight">
          <div className="mk-shell">
            <div className="mk-cta">
              <h2>Your career agent is ready when you are.</h2>
              <p>Build your free CV in minutes. No card, no commitment — just momentum.</p>
              <div className="actions" style={{ marginTop: 28 }}>
                <Link className="mk-btn-accent" href="/signup">Build My Free CV</Link>
                <Link className="mk-btn-ghost" href="/login">I already have an account</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
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
                <h4>Product</h4>
                <ul>
                  <li><Link href="/#how">How it works</Link></li>
                  <li><Link href="/#pricing">Pricing</Link></li>
                  <li><Link href="/signup">Sign up</Link></li>
                  <li><Link href="/login">Sign in</Link></li>
                </ul>
              </div>
              <div>
                <h4>Company</h4>
                <ul>
                  <li><Link href="/">About</Link></li>
                  <li><Link href="/">Privacy</Link></li>
                  <li><Link href="/">Terms</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="bottom">
            <span>© {new Date().getFullYear()} ModernJob. All rights reserved.</span>
            <span>Built in Lagos.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
