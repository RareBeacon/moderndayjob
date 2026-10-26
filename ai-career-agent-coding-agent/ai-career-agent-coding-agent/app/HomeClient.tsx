"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PLANS as PlansType } from "@/lib/billing/pricing";

type Props = {
  authenticated: boolean;
  plans: typeof PlansType;
};

const faqs = [
  { q: "What is Jobiest?", a: "Jobiest is an AI job-search agent that helps you find matching opportunities on supported boards, prepare tailored application documents, fill supported forms, and organise your applications." },
  { q: "Is Jobiest free?", a: "Yes. The Free plan costs ₦0 and includes three AI generations in total, ten career-tool uses per day, job-link analysis, and application tracking." },
  { q: "Can Jobiest apply for jobs automatically?", a: "On paid plans, you can choose approval-first or Auto send. Automatic submission works only through supported workflows, and some applications may require you to finish steps yourself." },
  { q: "Which job sites are supported?", a: "Jobiest supports searching selected employer boards and submitting through supported Greenhouse and Lever workflows. For other job sites, it can prepare your application package and provide a link to finish the process." },
  { q: "Will Jobiest guarantee me a job?", a: "No. Jobiest helps you prepare and manage applications, but employers make the hiring decisions. Interviews and job offers are not guaranteed." },
  { q: "What if an application needs my attention?", a: "If a website requires a CAPTCHA, assessment, login, or unsupported step, you may need to complete that step yourself." },
];

export default function HomeClient({ authenticated, plans }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <header>
        <div className="container nav" id="nav" style={{ position: "relative" }}>
          <Link className="logo" href={authenticated ? "/dashboard" : "/"} aria-label="Jobiest home" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/images/logo-wordmark-light.png" alt="Jobiest" width={544} height={262} priority sizes="156px" style={{ height: 26, width: "auto" }} />
          </Link>
          <nav className="navlinks" aria-label="Main navigation" style={mobileOpen ? { display: "flex", position: "absolute", left: 0, right: 0, top: 54, background: "white", padding: 18, border: "1px solid var(--line)", borderRadius: 15, boxShadow: "var(--shadow)", flexDirection: "column", alignItems: "flex-start", gap: 17 } as any : undefined}>
            <Link href="/how-it-works" onClick={() => setMobileOpen(false)}>How it works</Link>
            <Link href="/tools" onClick={() => setMobileOpen(false)}>Free tools</Link>
            <Link href="/pricing" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link href="#faq" onClick={() => setMobileOpen(false)}>FAQs</Link>
            <Link href="/about" onClick={() => setMobileOpen(false)}>About</Link>
          </nav>
          <div className="nav-actions">
            {authenticated ? (
              <Link className="login" href="/dashboard">Dashboard</Link>
            ) : (
              <Link className="login" href="/login">Log in</Link>
            )}
            <Link className="btn btn-lime btn-small" href={authenticated ? "/dashboard" : "/signup"}>
              {authenticated ? "Go to Dashboard" : "Get Started Free"} <span>→</span>
            </Link>
            <button className="mobile-toggle" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)} style={{ display: mobileOpen ? "block" : undefined }}>
              {mobileOpen ? "×" : "☰"}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <div className="eyebrow"><span className="dot" /> Your personal AI job-search agent</div>
              <h1>Stop chasing jobs.<br /><em>Let jobs come to you.</em></h1>
              <p className="hero-copy">Finding a job shouldn&apos;t feel like another full-time job. Jobiest helps you find opportunities, tailor your CV, write cover letters, and handle repetitive application tasks — so you can spend less time applying and more time preparing for your next big opportunity.</p>
              <div className="hero-buttons">
                <Link className="btn btn-lime" href={authenticated ? "/dashboard" : "/signup"}>Get Started Free <span>→</span></Link>
                <Link className="btn btn-dark" href="#how-it-works">▷ &nbsp; See How It Works</Link>
              </div>
              <div className="microtrust"><span>✓</span> No credit card required. Start free.</div>
            </div>
            <div className="hero-visual">
              <div className="photo hero-photo" role="img" aria-label="Professional working on a laptop" />
              <div className="agent-card">
                <div className="card-top"><strong>Good morning, Ada 👋</strong><span className="status">Agent active</span></div>
                <div style={{ fontSize: 12, color: "#72839a", marginBottom: 9 }}>Your AI agent is working for you.</div>
                <div className="jobrow"><span className="check">✓</span><div><strong>Matching jobs found</strong><small>Based on your preferences</small></div></div>
                <div className="jobrow"><span className="check">✓</span><div><strong>CV and cover letter tailored</strong><small>Prepared for your review</small></div></div>
                <div className="jobrow"><span className="check">✓</span><div><strong>Application ready</strong><small>You decide what happens next</small></div></div>
                <div className="progress"><span /></div>
                <Link className="btn btn-lime" style={{ width: "100%", fontSize: 12, padding: 11 }} href={authenticated ? "/applications" : "/signup"}>View applications →</Link>
              </div>
              <div className="float-tag">✦ Your job search, with less busywork.</div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container problem-grid">
            <div>
              <div className="section-kicker">The reality</div>
              <h2>You know what you want. Getting there shouldn&apos;t be this hard.</h2>
              <p style={{ color: "var(--muted)" }}>You find a job you&apos;re excited about. Then comes the work: update your CV, write a cover letter, fill out the same details you&apos;ve entered a dozen times, and answer the same questions.</p>
              <ul className="problem-list"><li>Rewrite your CV for every role.</li><li>Spend your evenings writing cover letters.</li><li>Fill out the same forms again and again.</li><li>Lose track of where you&apos;ve applied.</li></ul>
              <strong style={{ color: "var(--navy)" }}>You don&apos;t need another job just to get a job.</strong>
            </div>
            <div className="photo story-photo" role="img" aria-label="Job seeker working through applications"><div className="note">The same cycle…<span>Search. Rewrite. Apply. Repeat.</span></div></div>
          </div>
        </section>

        <section className="section section-mint">
          <div className="container solution-grid">
            <div><div className="section-kicker">Meet Jobiest</div><h2>Let your agent take the busywork off your plate.</h2><p style={{ color: "var(--muted)" }}>Tell Jobiest what you&apos;re looking for. Your agent helps discover matching roles on paid plans, prepares tailored CVs and cover letters, and handles supported application steps.</p><p style={{ color: "var(--muted)" }}>You review the work and decide what happens next.</p><Link className="btn btn-lime" href={authenticated ? "/dashboard" : "/signup"}>Let Jobiest Help →</Link></div>
            <div className="mock-dashboard"><div className="dash-head"><div><strong>Jobiest agent</strong><br /><small>Your job search at a glance</small></div><span className="status">Working</span></div>
              <div className="match"><span className="company-icon">✦</span><div><strong>Product Designer</strong><small>Remote · Full-time</small></div><span className="pill">Match</span></div>
              <div className="match"><span className="company-icon">◈</span><div><strong>Frontend Developer</strong><small>Hybrid · Full-time</small></div><span className="pill">Match</span></div>
              <div className="match"><span className="company-icon">▤</span><div><strong>Software Engineer</strong><small>Remote · Full-time</small></div><span className="pill">Match</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}><div className="feature" style={{ padding: 13 }}><strong style={{ fontSize: 12 }}>▣ Tailored CV</strong><p style={{ marginTop: 5 }}>Ready to review</p></div><div className="feature" style={{ padding: 13 }}><strong style={{ fontSize: 12 }}>✉ Cover letter</strong><p style={{ marginTop: 5 }}>Ready to review</p></div></div>
            </div>
          </div>
        </section>

        <section className="section section-soft">
          <div className="container"><div className="section-head"><div className="section-kicker">What Jobiest does for you</div><h2>Everything you need to make job hunting less exhausting.</h2><p>One place to manage more of the work between finding a job and getting noticed.</p></div>
            <div className="features">
              <article className="feature"><div className="feature-icon">⌕</div><h3>Find jobs that fit</h3><p>Discover matching opportunities on supported boards with paid plans, or bring your own job link.</p></article>
              <article className="feature"><div className="feature-icon">▤</div><h3>Make each application personal</h3><p>Tailor your CV to highlight the experience that matters for the role.</p></article>
              <article className="feature"><div className="feature-icon">✎</div><h3>Skip the blank page</h3><p>Prepare a relevant cover letter and application answers without starting from scratch.</p></article>
              <article className="feature"><div className="feature-icon">ϟ</div><h3>Spend less time on forms</h3><p>Fill supported application forms and reduce repetitive work.</p></article>
              <article className="feature"><div className="feature-icon">♢</div><h3>Stay in control</h3><p>Review applications before sending or choose Auto send on paid plans.</p></article>
              <article className="feature"><div className="feature-icon">↗</div><h3>Know where you stand</h3><p>Keep applications organised and track progress in one place.</p></article>
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="container"><div className="section-head center"><div className="section-kicker">How it works</div><h2>Three steps to a less stressful job search.</h2><p>Get set up, let your agent prepare the work, and decide what happens next.</p></div>
            <div className="steps">
              <article className="step"><div className="step-number">01</div><h3>Tell us what you&apos;re looking for.</h3><p>Set your preferences, share your experience, and tell Jobiest about the roles you want.</p></article>
              <article className="step"><div className="step-number">02</div><h3>Let your agent get to work.</h3><p>Find matching opportunities on supported boards, tailor your documents, and fill supported forms.</p></article>
              <article className="step"><div className="step-number">03</div><h3>Review, approve, and move forward.</h3><p>Check your applications and approve them before sending, or configure Auto send on paid plans.</p></article>
            </div>
          </div>
        </section>

        <section className="section section-soft">
          <div className="container trust-grid">
            <div className="photo trust-photo" role="img" aria-label="Professionals collaborating in a bright workspace" />
            <div><div className="section-kicker">Trust and control</div><h2>AI should help you get ahead — not make decisions behind your back.</h2><p style={{ color: "var(--muted)" }}>Your career matters. Jobiest helps you prepare applications around your real experience and your preferences. You choose how applications are sent, and you stay involved when a website needs your attention.</p>
              <div className="trust-points"><div className="trust-point">✓ Real experience<span>No made-up achievements.</span></div><div className="trust-point">◎ Your approval<span>Your choice, by default.</span></div><div className="trust-point">◇ Clear boundaries<span>Supported workflows only.</span></div><div className="trust-point">⌂ Your career<span>You stay in control.</span></div></div>
            </div>
          </div>
        </section>

        <section className="section" id="free-tools">
          <div className="container"><div className="section-head"><div className="section-kicker">Free career tools</div><h2>Not ready for an AI agent? Start with one useful tool.</h2><p>Explore tools that help you prepare your CV, understand job descriptions, and present yourself clearly.</p></div>
            <div className="tools-grid">
              <Link className="tool" href="/free-ats-resume-scanner"><div className="feature-icon">▤</div><strong>Resume Scanner</strong><p>Check your CV for common issues.</p></Link>
              <Link className="tool" href="/free-job-description-analyzer"><div className="feature-icon">⌕</div><strong>Job Description Analyzer</strong><p>Understand what an employer needs.</p></Link>
              <Link className="tool" href="/free-cover-letter-writer"><div className="feature-icon">✉</div><strong>Cover Letter Writer</strong><p>Get a starting point for your next letter.</p></Link>
              <Link className="tool" href="/free-resume-summary-generator"><div className="feature-icon">✎</div><strong>Resume Summary</strong><p>Describe your experience clearly.</p></Link>
              <Link className="tool" href="/free-linkedin-headline-builder"><div className="feature-icon">in</div><strong>LinkedIn Headline</strong><p>Make your profile more focused.</p></Link>
            </div><div style={{ marginTop: 25 }}><Link className="btn btn-white" href="/tools">Explore Free Career Tools →</Link></div>
          </div>
        </section>

        <section className="section section-soft" id="pricing">
          <div className="container"><div className="section-head center"><div className="section-kicker">Simple pricing</div><h2>Start free. Get more help when you need it.</h2><p>Explore the tools, then choose the level of help that fits your job search.</p></div>
            <div className="pricing-grid">
              <article className="price-card"><div className="plan">Free</div><div className="price">₦{plans.FREE.monthlyNgn.toLocaleString()} <span>forever</span></div><div className="price-desc">{plans.FREE.tagline}</div><ul><li>3 AI generations in total</li><li>10 career-tool uses per day</li><li>Job-link analysis</li><li>Application tracking</li></ul><Link className="btn btn-white" href={plans.FREE.ctaHref}>{plans.FREE.cta} →</Link></article>
              <article className="price-card"><div className="plan">Basic</div><div className="price">₦{plans.BASIC.monthlyNgn.toLocaleString()} <span>/ month</span></div><div className="price-desc">{plans.BASIC.tagline}</div><ul><li>3 AI generations per day</li><li>50 career-tool uses per day</li><li>2 agent runs in total</li><li>Approval-first or Auto send</li></ul><Link className="btn btn-white" href={plans.BASIC.ctaHref}>{plans.BASIC.cta} →</Link></article>
              <article className="price-card popular"><span className="popular-label">MOST POPULAR</span><div className="plan">Premium</div><div className="price">₦{plans.PREMIUM.monthlyNgn.toLocaleString()} <span>/ month</span></div><div className="price-desc">{plans.PREMIUM.tagline}</div><ul><li>10 AI generations per day</li><li>Daily matching-job discovery</li><li>10 agent applications per day</li><li>Unlimited career-tool uses</li></ul><Link className="btn btn-lime" href={plans.PREMIUM.ctaHref}>{plans.PREMIUM.cta} →</Link></article>
              <article className="price-card"><div className="plan">Max</div><div className="price">₦{plans.MAX.monthlyNgn.toLocaleString()} <span>/ month</span></div><div className="price-desc">{plans.MAX.tagline}</div><ul><li>20 AI generations per day</li><li>Daily matching-job discovery</li><li>20 agent applications per day</li><li>Unlimited career-tool uses</li></ul><Link className="btn btn-white" href={plans.MAX.ctaHref}>{plans.MAX.cta} →</Link></article>
            </div><p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 22 }}>Not sure which plan is right for you? Start free and explore the tools.</p>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container"><div className="section-head center"><div className="section-kicker">FAQs</div><h2>Got questions? We&apos;ve got answers.</h2><p>Here&apos;s what you need to know before getting started.</p></div>
            <div className="faq-list">
              {faqs.map((f, i) => (
                <div key={f.q} className={`faq-item${openFaq === i ? " open" : ""}`}>
                  <button className="faq-question" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span>{f.q}</span><span aria-hidden>{openFaq === i ? "−" : "+"}</span>
                  </button>
                  <div className="faq-answer" style={{ display: openFaq === i ? "block" : "none" }}>{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div className="container cta-inner"><div><div className="eyebrow"><span className="dot" /> Your next opportunity is worth the effort</div><h2>Your job search shouldn&apos;t take over your life.</h2><p>You bring the ambition. Jobiest helps with the searching, tailoring, preparing, and repetitive application work — while you focus on where you want your career to go.</p></div><div className="cta-actions"><Link className="btn btn-lime" href={authenticated ? "/dashboard" : "/signup"}>Get Started Free →</Link><Link className="btn btn-dark" href="#how-it-works">How it works</Link></div></div>
        </section>
      </main>

      <footer id="footer"><div className="container"><div className="footer-top">
        <div className="footer-brand"><Link href={authenticated ? "/dashboard" : "/"} aria-label="Jobiest home" style={{ display: "inline-flex" }}><Image src="/images/logo-wordmark-dark.png" alt="Jobiest" width={550} height={265} loading="lazy" sizes="144px" style={{ height: 24, width: "auto" }} /></Link><p>A smarter way to search for your next job. Less repetitive work, better-organised applications, and more time for your future.</p></div>
        <div className="footer-col"><strong>Explore</strong><Link href="/how-it-works">How it works</Link><Link href="/tools">Free tools</Link><Link href="/pricing">Pricing</Link><Link href="#faq">FAQs</Link></div>
        <div className="footer-col"><strong>Support</strong><Link href="/help">Help centre</Link><a href="mailto:support@jobiest.com">Contact</a><Link href="#faq">FAQs</Link></div>
        <div className="footer-col"><strong>Legal</strong><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms of service</Link><Link href="/refund">Refund policy</Link></div>
      </div><div className="footer-bottom"><span>© 2026 Jobiest. All rights reserved.</span><span>Hiring outcomes are not guaranteed.</span></div></div></footer>
    </>
  );
}
