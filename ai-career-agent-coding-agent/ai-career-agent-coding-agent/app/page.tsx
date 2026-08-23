import Link from 'next/link';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';

const FEATURES = [
  { ico: '👤', title: 'One verified profile', body: 'Add your real experience, skills and education once. Every application is built from facts you control — we never fabricate.' },
  { ico: '🔎', title: 'Smart job discovery', body: 'The agent finds and de-duplicates relevant opportunities from supported sources, so you stop re-reading the same posting.' },
  { ico: '🎯', title: 'Explainable matching', body: 'Every match shows why — skills, experience and role fit, with a clear score. No black-box rankings.' },
  { ico: '✍️', title: 'Truthful application prep', body: 'Personalized CVs, cover letters and answers generated only from your verified facts, with traceable sources.' },
  { ico: '🗂️', title: 'Full tracking', body: 'Every application, the exact documents used, and its status — from draft to interview to outcome — in one place.' },
  { ico: '🛡️', title: 'Control by design', body: 'Draft, assist, approval or auto modes. You approve before anything is sent. We never bypass CAPTCHAs or bot protection.' },
];

const STEPS = [
  { n: 1, title: 'Create your profile', body: 'Sign up free and add your background, or upload your existing CV.' },
  { n: 2, title: 'Set your targets', body: 'Roles, locations, remote preference, salary floor and a daily target.' },
  { n: 3, title: 'The agent works', body: 'It discovers, de-duplicates and scores opportunities, then prepares materials.' },
  { n: 4, title: 'Review & track', body: 'Approve applications your way and follow every outcome in your dashboard.' },
];

const PLANS = [
  { name: 'Free', price: '₦0', per: 'forever', featured: false, cta: 'Get started', href: '/signup', points: ['2 AI career credits / day', 'CV generation & ATS checks', 'Job matching & tracking', 'Manual applications'] },
  { name: 'Basic', price: '₦5,000', per: 'per month', featured: true, cta: 'Start with Basic', href: '/billing', points: ['Everything in Free', '10 automated applications / day', 'Priority job discovery', 'Approval-mode automation'] },
  { name: 'Premium', price: '₦10,000', per: 'per month', featured: false, cta: 'Go Premium', href: '/billing', points: ['Everything in Basic', '20 automated applications / day', 'Highest-priority matching', 'Advanced automation controls'] },
];

export default function Home() {
  return (
    <>
      <Header />
      <main id="main">
        {/* Hero */}
        <section className="hero">
          <div className="container">
            <span className="badge">Free forever · 2 AI credits a day</span>
            <h1>Your AI career agent that actually applies — truthfully.</h1>
            <p className="lead">
              Build your professional profile once. ModernJob discovers relevant roles, scores fit,
              prepares personalized CVs and answers from your verified facts, and tracks every
              application in one dashboard. You stay in control.
            </p>
            <div className="cta-row">
              <Link className="btn btn-lg" href="/signup">Get started — it’s free</Link>
              <Link className="btn btn-ghost btn-lg" href="#how">See how it works</Link>
            </div>
            <p className="trust">No credit card required · Works for any profession · You approve before anything is sent</p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="section">
          <div className="container">
            <div className="section-head">
              <h2>Everything you need to run a modern job search</h2>
              <p>One calm, trustworthy workspace — from your first profile to your next offer.</p>
            </div>
            <div className="feature-grid">
              {FEATURES.map((f) => (
                <article key={f.title} className="card feature">
                  <div className="ico" aria-hidden="true">{f.ico}</div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="section alt">
          <div className="container">
            <div className="section-head">
              <h2>How it works</h2>
              <p>Set it up once, then let your agent do the busywork — with you in charge.</p>
            </div>
            <div className="steps">
              {STEPS.map((s) => (
                <article key={s.n} className="card step">
                  <div className="n" aria-hidden="true">{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="section">
          <div className="container">
            <div className="section-head">
              <h2>Simple, honest pricing</h2>
              <p>Start free forever. Upgrade only when you want automation.</p>
            </div>
            <div className="pricing">
              {PLANS.map((p) => (
                <article key={p.name} className={`card plan${p.featured ? ' featured' : ''}`}>
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

        {/* CTA band */}
        <section className="section">
          <div className="container">
            <div className="cta-band">
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
