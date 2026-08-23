import Link from 'next/link';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { ScrollReveal } from '@/components/site/ScrollReveal';
import { AnimatedCounter } from '@/components/site/AnimatedCounter';
import { FAQ } from '@/components/site/FAQ';
import { IconProfile, IconDiscover, IconMatch, IconTruth, IconTrack, IconShield } from '@/components/site/icons';

const FEATURES = [
  { Icon: IconProfile, title: 'One verified profile', body: 'Add your real experience, skills and education once. Every application is built from facts you control — we never fabricate.' },
  { Icon: IconDiscover, title: 'Smart job discovery', body: 'The agent finds and de-duplicates relevant opportunities from supported sources, so you stop re-reading the same posting.' },
  { Icon: IconMatch, title: 'Explainable matching', body: 'Every match shows why — skills, experience and role fit, with a clear score. No black-box rankings.' },
  { Icon: IconTruth, title: 'Truthful application prep', body: 'Personalized CVs, cover letters and answers generated only from your verified facts, with traceable sources.' },
  { Icon: IconTrack, title: 'Full tracking', body: 'Every application, the exact documents used, and its status — from draft to interview to outcome — in one place.' },
  { Icon: IconShield, title: 'Control by design', body: 'Draft, assist, approval or auto modes. You approve before anything is sent. We never bypass CAPTCHAs or bot protection.' },
];

const USE_CASES = [
  { emoji: '💻', title: 'AI Engineers', body: 'Discover ML/AI roles, tailor CVs to stack-specific JDs, and prepare technical answers grounded in your real projects.' },
  { emoji: '🎬', title: 'Content Creators', body: 'Surface creator and strategy roles, highlight your platforms and portfolio, and draft niche-specific pitches.' },
  { emoji: '🎨', title: 'Designers', body: 'Match product and UX roles, emphasize case studies, and generate role-specific cover letters.' },
  { emoji: '📈', title: 'Marketers', body: 'Find growth and marketing roles, align campaigns with metrics, and prepare answers backed by your results.' },
];

const STATS = [
  { value: 2, suffix: '', label: 'Free AI credits daily' },
  { value: 7, suffix: ' days', label: 'Automation trial' },
  { value: 15, suffix: '', label: 'Trial applications included' },
  { value: 100, suffix: '%', label: 'Built from your facts' },
];

const STEPS = [
  { n: 1, title: 'Create your profile', body: 'Sign up free and add your background, or upload your existing CV.' },
  { n: 2, title: 'Set your targets', body: 'Roles, locations, remote preference, salary floor and a daily target.' },
  { n: 3, title: 'The agent works', body: 'It discovers, de-duplicates and scores opportunities, then prepares materials.' },
  { n: 4, title: 'Review & track', body: 'Approve applications your way and follow every outcome in your dashboard.' },
];

const PRINCIPLES = [
  { Icon: IconTruth, title: 'Truthful by design', body: 'Generated only from your verified facts, with source references for every claim. It never invents experience.' },
  { Icon: IconShield, title: 'Private by design', body: 'No inbox access, no OAuth to your email, no stored passwords. Your CV is private to your account.' },
  { Icon: IconProfile, title: 'You stay in control', body: 'Approval mode is the default. Nothing is submitted until you say so — and never past a CAPTCHA.' },
];

const PLANS = [
  { name: 'Free', price: '₦0', per: 'forever', featured: false, cta: 'Get started', href: '/signup', points: ['2 AI career credits / day', 'CV generation & ATS checks', 'Job matching & tracking', 'Manual applications'] },
  { name: 'Basic', price: '₦5,000', per: 'per month', featured: true, cta: 'Start with Basic', href: '/billing', points: ['Everything in Free', '10 automated applications / day', 'Priority job discovery', 'Approval-mode automation'] },
  { name: 'Premium', price: '₦10,000', per: 'per month', featured: false, cta: 'Go Premium', href: '/billing', points: ['Everything in Basic', '20 automated applications / day', 'Highest-priority matching', 'Advanced automation controls'] },
];

function HeroMockup() {
  return (
    <div className="hero-mockup">
      <span className="float-badge b1">✓ Application approved</span>
      <span className="float-badge b2">+12 new matches</span>
      <div className="mock-card">
        <div className="mock-head">
          <span className="mock-dot" />
          <strong>Agent active</strong>
          <span className="mock-pill">Approval mode</span>
        </div>
        <div className="mock-stats">
          <div><strong>92</strong><span>Match score</span></div>
          <div><strong>4</strong><span>Shortlisted</span></div>
          <div><strong>1</strong><span>Sent today</span></div>
        </div>
        <div className="mock-match">
          <div className="mm-co" aria-hidden="true">◆</div>
          <div><strong>Northwind Labs</strong><span>Senior Product Designer · Remote</span></div>
          <span className="score-chip">92</span>
        </div>
        <div className="mock-status">
          <span className="ok">✓</span> CV + cover letter ready from your profile
        </div>
      </div>
    </div>
  );
}

function MatchMock() {
  return (
    <div className="match-mock">
      <div className="mm-head">
        <span className="mm-co" aria-hidden="true">◆</span>
        <div><strong>Northwind Labs</strong><span>Senior Product Designer · Remote</span></div>
        <span className="score-chip">92</span>
      </div>
      <div className="mm-rows">
        <div className="mm-row"><span className="ok">✓</span> Skills match <span className="mm-meta">7 / 8</span></div>
        <div className="mm-row"><span className="ok">✓</span> Relevant experience <span className="mm-meta">5+ yrs</span></div>
        <div className="mm-row"><span className="warn">~</span> Location: hybrid preferred</div>
      </div>
    </div>
  );
}

function FlowMock() {
  const modes = ['Draft', 'Assist', 'Approval', 'Auto'];
  return (
    <div className="flow-mock">
      {modes.map((m, i) => (
        <div className={`flow-step${m === 'Approval' ? ' active' : ''}`} key={m}>
          <span className="flow-n">{i + 1}</span>
          <strong>{m}</strong>
          {m === 'Approval' ? <span className="flow-tag">You approve</span> : null}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Header />
      <ScrollReveal />
      <main id="main">
        {/* Hero */}
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="container hero-inner">
            <span className="badge">Free forever · 2 AI credits a day</span>
            <h1>
              Your AI career agent that <span className="grad">actually applies</span> — truthfully.
            </h1>
            <p className="lead">
              Build your professional profile once. ModernJob discovers relevant roles, scores fit,
              prepares personalized CVs and answers from your verified facts, and tracks every
              application in one dashboard. You stay in control.
            </p>
            <div className="cta-row">
              <Link className="btn btn-lg" href="/signup">Get started — it’s free</Link>
              <Link className="btn btn-ghost btn-lg" href="#how">See how it works</Link>
            </div>
            <p className="trust">No credit card · Works for any profession · You approve before anything is sent</p>
            <HeroMockup />
          </div>
          <div className="scroll-cue" aria-hidden="true"><span /></div>
        </section>

        {/* Profession marquee */}
        <section className="marquee" aria-label="Supported professions">
          <div className="marquee-track">
            {[0, 1].map((dup) => (
              <div className="marquee-group" key={dup} aria-hidden={dup === 1}>
                {['AI Engineer', 'Product Designer', 'Content Creator', 'Marketer', 'Data Analyst', 'Developer', 'UX Researcher', 'Copywriter', 'Product Manager', 'Recruiter'].map((r) => (
                  <span className="chip" key={r}>{r}</span>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="section">
          <div className="container">
            <div className="stats" data-reveal>
              {STATS.map((s) => (
                <div className="stat" key={s.label}>
                  <div className="num"><AnimatedCounter value={s.value} suffix={s.suffix} /></div>
                  <div className="label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="section alt">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2>Everything you need to run a modern job search</h2>
              <p>One calm, trustworthy workspace — from your first profile to your next offer.</p>
            </div>
            <div className="feature-grid">
              {FEATURES.map((f) => (
                <article key={f.title} className="card feature" data-reveal>
                  <span className="ico"><f.Icon /></span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="section">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2>Built for every profession</h2>
              <p>The profession is your data — not hard-coded. The same agent adapts to what you do.</p>
            </div>
            <div className="usecase-grid">
              {USE_CASES.map((u) => (
                <article key={u.title} className="card usecase" data-reveal>
                  <span className="ico emoji">{u.emoji}</span>
                  <h3>{u.title}</h3>
                  <p>{u.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Showcase */}
        <section className="section alt">
          <div className="container">
            <div className="showcase-row" data-reveal>
              <div className="showcase-copy">
                <span className="badge">Explainable matching</span>
                <h2>See exactly why a job matches</h2>
                <p>Every opportunity comes with a clear score and the reasons behind it — skills, experience and role fit. No black-box rankings, and missing requirements are surfaced so you’re never surprised.</p>
                <Link className="inline-link" href="/signup">Try matching →</Link>
              </div>
              <div className="showcase-visual"><MatchMock /></div>
            </div>
            <div className="showcase-row flip" data-reveal>
              <div className="showcase-copy">
                <span className="badge">You’re in control</span>
                <h2>Approve every application, your way</h2>
                <p>Pick Draft, Assist, Approval or Auto. Approval is the default — you review the CV, cover letter and answers, then decide. Auto mode still stops on CAPTCHAs and unsupported sites.</p>
                <Link className="inline-link" href="/signup">Set your mode →</Link>
              </div>
              <div className="showcase-visual"><FlowMock /></div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="section">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2>How it works</h2>
              <p>Set it up once, then let your agent do the busywork — with you in charge.</p>
            </div>
            <div className="steps">
              {STEPS.map((s) => (
                <article key={s.n} className="card step" data-reveal>
                  <div className="n" aria-hidden="true">{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="section alt">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2>Trust, built in</h2>
              <p>Three principles we never compromise on.</p>
            </div>
            <div className="principles">
              {PRINCIPLES.map((p) => (
                <article key={p.title} className="card principle" data-reveal>
                  <span className="ico"><p.Icon /></span>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="section">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2>Simple, honest pricing</h2>
              <p>Start free forever. Upgrade only when you want automation.</p>
            </div>
            <div className="pricing">
              {PLANS.map((p) => (
                <article key={p.name} className={`card plan${p.featured ? ' featured' : ''}`} data-reveal>
                  {p.featured ? <span className="tag badge">Most popular</span> : null}
                  <h3>{p.name}</h3>
                  <div className="price">{p.price} <small>/ {p.per}</small></div>
                  <ul>
                    {p.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                  <Link className={`btn${p.featured ? '' : ' btn-ghost'} btn-block`} href={p.href}>{p.cta}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section alt">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2>Questions, answered</h2>
              <p>The honest answers to what people ask first.</p>
            </div>
            <div data-reveal><FAQ /></div>
          </div>
        </section>

        {/* CTA band */}
        <section className="section">
          <div className="container">
            <div className="cta-band" data-reveal>
              <h2>Ready to let your career agent get to work?</h2>
              <p>Create your free profile in minutes. No credit card.</p>
              <div className="cta-row">
                <Link className="btn btn-lg btn-light" href="/signup">Get started free</Link>
                <Link className="btn btn-lg btn-ghost-light" href="/login">I already have an account</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
