"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PLANS as PlansType } from "@/lib/billing/pricing";

type Props = { authenticated: boolean; plans: typeof PlansType };

const faqs = [
  { q: "What is Jobiest?", a: "Jobiest is an AI job-search agent that helps you find matching opportunities on supported boards, prepare tailored application documents, fill supported forms, and organise your applications." },
  { q: "Is Jobiest free?", a: "Yes. The Free plan costs ₦0 and includes three AI generations in total, ten career-tool uses per day, job-link analysis, and application tracking." },
  { q: "Can Jobiest apply for jobs automatically?", a: "On paid plans, you can choose approval-first or Auto send. Automatic submission works only through supported workflows." },
  { q: "Which job sites are supported?", a: "Supported Greenhouse and Lever workflows, plus preparation for any job link." },
  { q: "Will Jobiest guarantee me a job?", a: "No. Employers make the hiring decisions." },
  { q: "What if an application needs my attention?", a: "CAPTCHA, login or assessment → you finish that step." },
];

export default function HomeClient({ authenticated, plans }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <>
      <header>
        <div className="container nav" style={{ position: "relative" }}>
          <Link href={authenticated ? "/dashboard" : "/"} aria-label="Jobiest home" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/images/logo-wordmark-light.png" alt="Jobiest" width={544} height={262} priority sizes="156px" style={{ height: 26, width: "auto" }} />
          </Link>
          <nav className="navlinks" aria-label="Main navigation" style={mobileOpen ? { display: "flex", position: "absolute", left: 0, right: 0, top: 54, background: "white", padding: 18, border: "1px solid var(--line)", borderRadius: 15, boxShadow: "var(--shadow)", flexDirection: "column", alignItems: "flex-start", gap: 17 } as any : undefined}>
            <Link href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</Link>
            <Link href="/tools" onClick={() => setMobileOpen(false)}>Free tools</Link>
            <Link href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link href="#faq" onClick={() => setMobileOpen(false)}>FAQs</Link>
            <Link href="/about" onClick={() => setMobileOpen(false)}>About</Link>
          </nav>
          <div className="nav-actions">
            <Link className="login" href={authenticated ? "/dashboard" : "/login"}>{authenticated ? "Dashboard" : "Log in"}</Link>
            <Link className="btn btn-lime btn-small" href={authenticated ? "/dashboard" : "/signup"}>{authenticated ? "Go to Dashboard" : "Get Started Free"} <span>→</span></Link>
            <button className="mobile-toggle" aria-label="Toggle navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)}>{mobileOpen ? "×" : "☰"}</button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO — matches https://jobiest-kjdwqea7.manus.space/ exact copy */}
        <section className="hero" style={{ background: "#0a1830" }}>
          <div className="container hero-grid">
            <div>
              <h1 style={{ fontSize: "clamp(34px,4.5vw,52px)", lineHeight: 1.05, letterSpacing: "-1.6px", margin: 0 }}>Land more interviews.<br />Skip the busywork.<br /><em>Get closer to work you love.</em></h1>
              <p className="hero-copy" style={{ color: "#cbd5e1", marginTop: 14 }}>Paste a job link and get a truthful, tailored application in minutes — so you spend less time rewriting CVs and more time meeting the teams you want to join. Review everything, stay in control, and move closer to your next great role.</p>
              <div className="hero-buttons" style={{ marginTop: 18 }}>
                <Link className="btn btn-lime" href="#pricing">Start for free <span>→</span></Link>
                <Link className="btn btn-dark" href="#how-it-works">See how it works</Link>
              </div>
              <div className="microtrust" style={{ marginTop: 14, color: "#9fb0c6", fontSize: 12 }}>✓ You approve every application before it goes anywhere.</div>
            </div>
            <div className="hero-visual">
              <div className="photo hero-photo" role="img" aria-label="Person at laptop" style={{ backgroundImage: "linear-gradient(90deg, rgba(10,24,48,.55), rgba(10,24,48,.08)), url('https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1100&q=85')" }} />
              <div className="agent-card" style={{ width: 360, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong style={{ fontSize: 12 }}>Job Application Review</strong><span style={{ fontSize: 10, fontWeight: 800, background: "#fef9c3", color: "#92400e", padding: "5px 8px", borderRadius: 999 }}>Needs your approval</span></div>
                <div style={{ marginTop: 8, fontSize: 12, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 12 }}>
                  <strong>Senior Frontend Developer</strong><br /><small style={{ color: "var(--muted)" }}>TechFusion • Remote</small>
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <div style={{ padding: "8px 10px", border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 10, fontSize: 11, display: "flex", justifyContent: "space-between" }}><span>CV tailored to this role</span><span style={{ color: "#16a34a", fontWeight: 800 }}>View</span></div>
                  <div style={{ padding: "8px 10px", border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 10, fontSize: 11, display: "flex", justifyContent: "space-between" }}><span>Matches 4/5 required skills</span><span style={{ background: "#fff", border: "1px solid #bbf7d0", padding: "2px 6px", borderRadius: 999, fontWeight: 800, color: "#15803d" }}>Verified</span></div>
                  <div style={{ padding: "8px 10px", border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 10, fontSize: 11, display: "flex", justifyContent: "space-between" }}><span>Flagged unsupported claim</span><span style={{ background: "#fff", border: "1px solid #fed7aa", padding: "2px 6px", borderRadius: 999, fontWeight: 800 }}>Review</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
                    <div style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 10, fontSize: 10 }}>CV<br /><strong>Ready →</strong></div>
                    <div style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 10, fontSize: 10 }}>Cover letter<br /><strong>Ready →</strong></div>
                  </div>
                </div>
                <Link className="btn btn-lime" href={authenticated ? "/applications" : "/signup"} style={{ width: "100%", marginTop: 10, fontSize: 12, padding: 10 }}>Review & approve</Link>
              </div>
            </div>
          </div>
        </section>

        {/* The reality */}
        <section className="section">
          <div className="container problem-grid">
            <div>
              <div className="section-kicker">The reality</div>
              <h2>Job hunting is a full-time job. Without the pay.</h2>
              <p style={{ color: "var(--muted)", marginTop: 8 }}>If you are job hunting right now, you already know the routine.</p>
              <ul className="problem-list">
                <li>You rewrite your CV for every single job.</li>
                <li>You write cover letters late at night.</li>
                <li>You fill in the same forms, again and again.</li>
                <li>You scroll job boards on the bus, at lunch, at midnight.</li>
                <li>And most applications are met with silence.</li>
              </ul>
              <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 14 }}>Week of this. Months, even. It drains the energy you should be spending on the interviews that matter. It doesn&apos;t have to be your life.</p>
            </div>
            <div className="photo story-photo" role="img" aria-label="Woman working">
              <div className="note" style={{ transform: "rotate(1.5deg)", maxWidth: 190 }}>Let Jobiest handle the busy work…<span>Research<br />Tailor CV<br />Write cover letter<br />Fill form<br />Follow up</span></div>
            </div>
          </div>
        </section>

        {/* Hard truth */}
        <section className="section section-soft">
          <div className="container problem-grid">
            <div>
              <div className="section-kicker">The hard truth</div>
              <h2>It’s not you. It’s the numbers.</h2>
              <p style={{ color: "var(--muted)" }}>Even if you&apos;re qualified, a lot depends on how you present yourself. Recruiters spend seconds scanning. Small gaps, wrong keywords, or missing details can get you overlooked.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 16, textAlign: "center" }}>
                <div><div style={{ fontSize: 24, fontWeight: 900, color: "var(--navy)" }}>6s</div><div style={{ fontSize: 11, color: "var(--muted)" }}>Average time a recruiter spends on a CV</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 900, color: "var(--navy)" }}>74%</div><div style={{ fontSize: 11, color: "var(--muted)" }}>of applications are never read</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 900, color: "var(--navy)" }}>2x</div><div style={{ fontSize: 11, color: "var(--muted)" }}>More callbacks with ATS-optimised CVs</div></div>
              </div>
              <Link href="#how-it-works" style={{ marginTop: 12, display: "inline-flex", fontSize: 12, fontWeight: 800, color: "var(--blue)" }}>Get the numbers on your side →</Link>
            </div>
            <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 14, boxShadow: "var(--shadow)" }}>
              <div style={{ height: 160, borderRadius: 14, background: "#f1f5f9", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 12 }}>Laptop preview</div>
              <div style={{ marginTop: 10, fontSize: 12, border: "1px solid #bbf7d0", background: "#f0fdf4", padding: 10, borderRadius: 10 }}><strong>ATS Optimised</strong><br /><span style={{ color: "var(--muted)" }}>Keywords matched • Skills aligned • Formatting ready</span></div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="section" id="how-it-works">
          <div className="container problem-grid">
            <div>
              <div className="section-kicker">How it works</div>
              <h2>Your job search, handled.</h2>
              <p style={{ color: "var(--muted)", marginTop: 6 }}>Jobiest researches, writes and applies — with your approval.</p>
              <ul className="problem-list" style={{ marginTop: 12 }}>
                <li>On-demand or max-apply — your choice.</li>
                <li>AI writes a truthful, tailored CV and cover letter.</li>
                <li>You review, edit and approve before it gets sent.</li>
                <li>You track progress, get updates and land interviews.</li>
              </ul>
              <Link className="btn btn-lime" href="#pricing" style={{ marginTop: 14 }}>Start free trial →</Link>
            </div>
            <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 12, boxShadow: "var(--shadow)" }}>
              <div style={{ height: 160, borderRadius: 14, background: "#f1f5f9", display: "grid", placeItems: "center", color: "var(--muted)" }}>Phone preview</div>
              <div style={{ marginTop: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, fontSize: 12 }}>✓ Application submitted!<br /><strong>Senior Frontend Developer</strong></div>
            </div>
          </div>
        </section>

        {/* Three steps */}
        <section className="section section-soft" id="steps">
          <div className="container">
            <div className="section-head"><div className="section-kicker">Three simple steps</div><h2>Three steps. Fifteen minutes to set up.</h2><p>No more guesswork. No more wasted hours. Just progress.</p></div>
            <div className="steps">
              <article className="step"><div className="step-number">1</div><h3>Add your details once</h3><p>Tell us about your experience, skills and goals. Your profile powers every application.</p></article>
              <article className="step"><div className="step-number">2</div><h3>Tailor and apply</h3><p>Paste a job link or choose a role, Jobiest writes your CV and cover letter, then applies with your approval.</p><span style={{ fontSize: 11, background: "#f0fdf4", padding: "4px 8px", borderRadius: 999, marginTop: 8, display: "inline-block" }}>Takes ~15 minutes</span></article>
              <article className="step"><div className="step-number">3</div><h3>Track and get interviews</h3><p>See real-time updates, review applications, and land more interviews — faster.</p></article>
            </div>
          </div>
        </section>

        {/* Pricing — uses your real PLANS tokens per your request */}
        <section className="section" id="pricing">
          <div className="container"><div className="section-head center"><div className="section-kicker">Pricing</div><h2>Start free. Upgrade if it works for you.</h2><p>Choose the plan that fits your goals. Cancel anytime.</p></div>
            <div className="pricing-grid">
              <article className="price-card"><div className="plan">Basic</div><div className="price">₦{plans.BASIC.monthlyNgn.toLocaleString()} <span>/ month</span></div><div className="price-desc">Up to 10 applications per month</div><ul><li>Up to 10 applications per month</li><li>Basic AI CV & cover letter</li><li>Job tracking & notifications</li></ul><Link className="btn btn-white" href={plans.BASIC.ctaHref}>Get started →</Link></article>
              <article className="price-card popular"><span className="popular-label">Most popular</span><div className="plan">Premium</div><div className="price">₦{plans.PREMIUM.monthlyNgn.toLocaleString()} <span>/ month</span></div><div className="price-desc">Up to 30 applications per month</div><ul><li>Up to 30 applications per month</li><li>Advanced AI tailoring</li><li>Priority support</li><li>Full application tracking</li></ul><Link className="btn btn-lime" href={plans.PREMIUM.ctaHref}>Get started →</Link></article>
              <article className="price-card"><div className="plan">Max</div><div className="price">₦{plans.MAX.monthlyNgn.toLocaleString()} <span>/ month</span></div><div className="price-desc">Unlimited applications</div><ul><li>Unlimited applications</li><li>Premium AI automation</li><li>Dedicated account</li><li>Advanced analytics</li></ul><Link className="btn btn-white" href={plans.MAX.ctaHref}>Get started →</Link></article>
              <article className="price-card" style={{ opacity: .85 }}><div className="plan">Free</div><div className="price">₦0 <span>forever</span></div><div className="price-desc">{plans.FREE.tagline}</div><ul><li>3 AI generations total</li><li>10 tool uses / day</li><li>Job-link analysis</li><li>Application tracking</li></ul><Link className="btn btn-white" href={plans.FREE.ctaHref}>Start free →</Link></article>
            </div>
          </div>
        </section>

        {/* Final CTA — matches manus */}
        <section className="final-cta" style={{ background: "#070d1c" }}>
          <div className="container cta-inner"><div><h2 style={{ color: "#fff", fontSize: "clamp(28px,3.2vw,40px)", margin: 0 }}>The job you want is still open.</h2><p style={{ color: "#cbd5e1", marginTop: 8 }}>Get more interviews, less job hunting, and stay in control.</p></div><div className="cta-actions" style={{ display: "flex", gap: 10 }}><Link className="btn btn-lime" href="/signup">Create free account →</Link><Link className="btn btn-dark" href="/tools">Try the free tools</Link></div></div>
        </section>

        {/* FAQs */}
        <section className="section" id="faq">
          <div className="container"><div className="section-head center"><div className="section-kicker">FAQs</div><h2>Got questions? We&apos;ve got answers.</h2></div>
            <div className="faq-list">
              {faqs.map((f, i) => (
                <div key={f.q} className={`faq-item${openFaq === i ? " open" : ""}`}>
                  <button className="faq-question" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}><span>{f.q}</span><span>{openFaq === i ? "−" : "+"}</span></button>
                  <div className="faq-answer" style={{ display: openFaq === i ? "block" : "none" }}>{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer id="footer"><div className="container"><div className="footer-top">
        <div className="footer-brand"><Link href={authenticated ? "/dashboard" : "/"} style={{ display: "inline-flex" }}><Image src="/images/logo-wordmark-dark.png" alt="Jobiest" width={550} height={265} style={{ height: 24, width: "auto" }} /></Link><p>Truthful job applications, prepared from your experience. Approval is the default.</p></div>
        <div className="footer-col"><strong>Explore</strong><Link href="#how-it-works">How it works</Link><Link href="/tools">Free tools</Link><Link href="#pricing">Pricing</Link></div>
        <div className="footer-col"><strong>Support</strong><Link href="/help">Help centre</Link><a href="mailto:support@jobiest.com">Contact</a></div>
        <div className="footer-col"><strong>Legal</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refund">Refunds</Link></div>
      </div><div className="footer-bottom"><span>© 2026 Jobiest.</span><span>Approval is the default; Auto requires opt-in.</span></div></div></footer>
    </>
  );
}
