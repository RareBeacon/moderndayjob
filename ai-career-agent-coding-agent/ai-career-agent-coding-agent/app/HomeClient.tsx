"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PLANS as PlansType } from "@/lib/billing/pricing";

type Props = { authenticated: boolean; plans: typeof PlansType };

export default function HomeClient({ authenticated, plans }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header style={{ background: "#070d1c", borderBottom: "1px solid #1c304b" }}>
        <div className="container nav" style={{ position: "relative", height: 68 }}>
          <Link href={authenticated ? "/dashboard" : "/"} aria-label="Jobiest home" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/images/logo-wordmark-dark.png" alt="Jobiest" width={550} height={265} priority sizes="140px" style={{ height: 22, width: "auto" }} />
          </Link>
          <nav className="navlinks" aria-label="Main navigation" style={{ color: "#cbd5e1", ...(mobileOpen ? { display: "flex", position: "absolute", left: 0, right: 0, top: 62, background: "#0a1830", padding: 18, border: "1px solid #1c304b", borderRadius: 14, flexDirection: "column", alignItems: "flex-start", gap: 16, zIndex: 30 } as any : undefined) }}>
            <Link href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</Link>
            <Link href="/tools" onClick={() => setMobileOpen(false)}>Free tools</Link>
            <Link href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link href="/blog" onClick={() => setMobileOpen(false)}>Blog</Link>
            <Link href="/about" onClick={() => setMobileOpen(false)}>About</Link>
          </nav>
          <div className="nav-actions">
            <Link className="login" href={authenticated ? "/dashboard" : "/login"} style={{ color: "#cbd5e1" }}>{authenticated ? "Dashboard" : "Log in"}</Link>
            <Link className="btn btn-lime btn-small" href={authenticated ? "/dashboard" : "/signup"} style={{ background: "#d7f94b", color: "#111d35" }}>{authenticated ? "Go to Dashboard" : "Get started free"} <span aria-hidden>→</span></Link>
            <button className="mobile-toggle" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)} style={{ color: "#fff" }}>{mobileOpen ? "×" : "☰"}</button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero" style={{ background: "#070d1c", minHeight: 520 }}>
          <div className="container hero-grid" style={{ paddingTop: 48, paddingBottom: 48, gap: 40 }}>
            <div>
              <h1 style={{ fontSize: "clamp(36px,4.8vw,56px)", lineHeight: 1.05, letterSpacing: "-1.8px", margin: 0, color: "#fff" }}>
                Land more<br />interviews.<br /><span style={{ color: "#d7f94b" }}>Skip the busywork.</span><br /><span style={{ color: "#fff" }}>Get closer to work you love.</span>
              </h1>
              <p style={{ color: "#cbd5e1", marginTop: 14, fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>
                Paste a job link and get a truthful, tailored application in minutes — so you spend less time rewriting CVs and more time meeting the teams you want to join. Review everything, stay in control, and move closer to your next great role.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <Link className="btn btn-lime" href="#pricing" style={{ background: "#d7f94b", color: "#111d35" }}>Start for free <span aria-hidden>→</span></Link>
                <Link className="btn btn-dark" href="#how-it-works" style={{ borderColor: "rgba(255,255,255,.4)", color: "#fff" }}>See how it works</Link>
              </div>
              <p style={{ color: "#9fb0c6", fontSize: 11, marginTop: 10 }}>◎ You approve every application before it goes anywhere.</p>
            </div>
            <div className="hero-visual" style={{ minHeight: 380 }}>
              <Image src="/images/hero-person.jpg" alt="Smiling professional with laptop" width={560} height={420} priority style={{ position: "absolute", inset: "0 0 0 15px", objectFit: "cover", borderRadius: 22, width: "calc(100% - 15px)", height: "100%" }} />
              <div className="agent-card" style={{ width: 320, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong style={{ fontSize: 11 }}>Job Application Review</strong><span style={{ fontSize: 8, fontWeight: 800, background: "#fef9c3", color: "#92400e", padding: "4px 6px", borderRadius: 999 }}>Needs your approval</span></div>
                <div style={{ marginTop: 8, padding: "8px 10px", border: "1px solid #e2e6ed", borderRadius: 10, fontSize: 10, display: "flex", justifyContent: "space-between" }}><span><strong>Senior Frontend Developer</strong><br /><small style={{ color: "#64748b" }}>TechFusion • Remote</small></span><span style={{ color: "#3b72bc", fontWeight: 700 }}>View</span></div>
                <div style={{ marginTop: 6, padding: "7px 10px", border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 10, fontSize: 10, display: "flex", justifyContent: "space-between" }}><span>✓ CV tailored to this role</span><span style={{ background: "#fff", border: "1px solid #bbf7d0", padding: "2px 6px", borderRadius: 999, fontWeight: 800, color: "#15803d" }}>Verified</span></div>
                <div style={{ marginTop: 6, padding: "7px 10px", border: "1px solid #bbf7d0", background: "#fff", borderRadius: 10, fontSize: 10, display: "flex", justifyContent: "space-between" }}><span>• Matches 4/5 required skills</span><span style={{ background: "#f0fdf4", padding: "2px 6px", borderRadius: 999, color: "#15803d", fontWeight: 800 }}>Verified</span></div>
                <div style={{ marginTop: 6, padding: "7px 10px", border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 10, fontSize: 10, display: "flex", justifyContent: "space-between" }}><span>⚠ Flagged unsupported claim</span><span style={{ background: "#fff", padding: "2px 6px", borderRadius: 999, fontWeight: 800, border: "1px solid #fed7aa" }}>Review</span></div>
                <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div style={{ padding: 7, border: "1px solid #e2e6ed", borderRadius: 10, fontSize: 10 }}><strong>CV</strong><br />Ready →</div>
                  <div style={{ padding: 7, border: "1px solid #e2e6ed", borderRadius: 10, fontSize: 10 }}><strong>Cover letter</strong><br />Ready →</div>
                </div>
                <Link className="btn btn-lime" href="/signup" style={{ width: "100%", marginTop: 10, background: "#d7f94b", color: "#111d35", fontSize: 11 }}>Review & approve →</Link>
              </div>
            </div>
          </div>
        </section>

        {/* THE REALITY */}
        <section className="section" style={{ padding: "64px 0", background: "#fff" }}>
          <div className="container problem-grid" style={{ gap: 40 }}>
            <div>
              <p style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>The reality</p>
              <h2 style={{ fontSize: "clamp(22px,2.6vw,32px)", lineHeight: 1.15, marginTop: 8, color: "#111d35" }}>Job hunting is a full-time job.<br />Without the pay.</h2>
              <p style={{ color: "#475569", marginTop: 10, fontSize: 13 }}>If you are job hunting right now, you already know the routine.</p>
              <ul style={{ listStyle: "none", padding: 0, marginTop: 12, display: "grid", gap: 6, fontSize: 12 }}>
                <li>✓ You rewrite your CV for every single job.</li>
                <li>✓ You write cover letters late at night.</li>
                <li>✓ You fill in the same forms, again and again.</li>
                <li>✓ You scroll job boards on the bus, at lunch, at midnight.</li>
                <li>✓ And most applications are met with silence.</li>
              </ul>
              <p style={{ color: "#94a3b8", fontSize: 11, marginTop: 12 }}>Week of this. Months, even. It drains the energy you should be spending on the interviews that matter.</p>
            </div>
            <div style={{ position: "relative" }}>
              <Image src="/images/life-cafe.jpg" alt="Woman focused on laptop" width={560} height={380} style={{ width: "100%", height: 320, objectFit: "cover", borderRadius: 18, boxShadow: "0 18px 50px rgba(0,0,0,.1)" }} />
              <div style={{ position: "absolute", right: -10, top: 10, background: "#fff", border: "1px solid #e2e6ed", borderRadius: 12, padding: 12, fontSize: 11, boxShadow: "0 12px 30px rgba(0,0,0,.1)", transform: "rotate(1.5deg)" }}>
                <strong>Jobiest handle<br />the busy work…</strong><br /><span style={{ color: "#64748b" }}>Research<br />Tailor CV<br />Write cover letter<br />Fill form<br />Follow up</span>
              </div>
            </div>
          </div>
        </section>

        {/* HARD TRUTH */}
        <section className="section" style={{ background: "#f0f7ff", padding: "64px 0" }}>
          <div className="container problem-grid">
            <div>
              <p style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>The hard truth</p>
              <h2 style={{ fontSize: "clamp(22px,2.6vw,32px)", marginTop: 8, color: "#111d35" }}>It’s not you. It’s the numbers.</h2>
              <p style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>Even if you’re qualified, a lot depends on how you present yourself. Recruiters spend seconds scanning. Small gaps, wrong keywords, or missing details can get you overlooked.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 18, borderTop: "1px solid #e2e6ed", borderBottom: "1px solid #e2e6ed", padding: "14px 0" }}>
                <div><div style={{ fontWeight: 900, fontSize: 18 }}>6s</div><div style={{ fontSize: 10, color: "#64748b" }}>Average time a recruiter spends on a CV</div></div>
                <div style={{ borderLeft: "1px solid #e2e6ed", paddingLeft: 16 }}><div style={{ fontWeight: 900, fontSize: 18 }}>74%</div><div style={{ fontSize: 10, color: "#64748b" }}>of applications are never read</div></div>
                <div style={{ borderLeft: "1px solid #e2e6ed", paddingLeft: 16 }}><div style={{ fontWeight: 900, fontSize: 18 }}>2x</div><div style={{ fontSize: 10, color: "#64748b" }}>More callbacks with ATS-optimised CVs</div></div>
              </div>
              <Link href="#how-it-works" style={{ fontSize: 12, fontWeight: 800, color: "#3b72bc", marginTop: 10, display: "inline-block" }}>Get the numbers on your side →</Link>
            </div>
            <div style={{ position: "relative" }}>
              <Image src="/images/case-2-jobs.jpg" alt="ATS preview" width={560} height={360} style={{ width: "100%", height: "auto", borderRadius: 18, border: "1px solid #e2e6ed" }} />
              <div style={{ position: "absolute", right: 12, top: 40, background: "#fff", border: "1px solid #e2e6ed", borderRadius: 12, padding: 12, fontSize: 11, boxShadow: "0 12px 30px rgba(0,0,0,.12)" }}>
                <strong>✓ ATS Optimised</strong><br /><span style={{ color: "#64748b" }}>Keywords matched<br />Skills aligned<br />Formatting ready</span>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="section" id="how-it-works" style={{ background: "#f0fdf4", padding: "64px 0" }}>
          <div className="container problem-grid">
            <div>
              <p style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>How it works</p>
              <h2 style={{ fontSize: "clamp(22px,2.6vw,32px)", color: "#111d35" }}>Your job search, handled.</h2>
              <p style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>Jobiest researches, writes and applies — with your approval.</p>
              <ul style={{ listStyle: "none", padding: 0, marginTop: 12, display: "grid", gap: 6, fontSize: 12 }}>
                <li>✓ On-demand or max-apply — your choice.</li>
                <li>✓ AI writes a truthful, tailored CV and cover letter.</li>
                <li>✓ You review, edit and approve before it gets sent.</li>
                <li>✓ You track progress, get updates and land interviews.</li>
              </ul>
              <Link className="btn btn-lime" href="#pricing" style={{ marginTop: 14, background: "#d7f94b", color: "#111d35", padding: "8px 14px", fontSize: 12 }}>Start free trial →</Link>
            </div>
            <div style={{ position: "relative" }}>
              <Image src="/images/hero-glow.jpg" alt="Person on phone" width={560} height={380} style={{ width: "100%", height: 320, objectFit: "cover", borderRadius: 18 }} />
              <div style={{ position: "absolute", right: 10, top: 20, background: "#fff", borderRadius: 12, padding: 10, fontSize: 11, boxShadow: "0 12px 30px rgba(0,0,0,.12)", border: "1px solid #e2e6ed" }}>
                ✓ Application submitted!<br /><span style={{ color: "#64748b" }}>Senior Frontend Developer</span>
              </div>
              <div style={{ position: "absolute", right: 10, bottom: 20, background: "#fff", borderRadius: 999, padding: "8px 12px", fontSize: 11, boxShadow: "0 8px 20px rgba(0,0,0,.1)" }}>● New interview opportunity!</div>
            </div>
          </div>
        </section>

        {/* THREE STEPS */}
        <section className="section" style={{ padding: "64px 0", background: "#fff" }}>
          <div className="container">
            <p style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Three simple steps</p>
            <h2 style={{ fontSize: "clamp(22px,2.6vw,28px)", color: "#111d35" }}>Three steps. Fifteen minutes to set up.</h2>
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>No more guesswork. No more wasted hours. Just progress.</p>
            <div className="steps" style={{ marginTop: 18 }}>
              <article className="step" style={{ background: "#fff" }}><div className="step-number" style={{ background: "#d7f94b", color: "#111d35" }}>1</div><h3>Add your details once</h3><p>Tell us about your experience, skills and goals. Your profile powers every application.</p></article>
              <article className="step" style={{ background: "#fff" }}><div className="step-number" style={{ background: "#d7f94b", color: "#111d35" }}>2</div><h3>Tailor and apply</h3><p>Paste a job link or choose a role, Jobiest writes your CV and cover letter, then applies with your approval.</p></article>
              <article className="step" style={{ background: "#fff" }}><div className="step-number" style={{ background: "#d7f94b", color: "#111d35" }}>3</div><h3>Track and get interviews</h3><p>See real-time updates, review applications, and land more interviews — faster.</p></article>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="section" id="pricing" style={{ background: "#f0f7ff", padding: "64px 0" }}>
          <div className="container">
            <p style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 800, color: "#64748b" }}>Pricing</p>
            <h2 style={{ fontSize: "clamp(22px,2.6vw,28px)", color: "#111d35" }}>Start free. Upgrade if it works for you.</h2>
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>Choose the plan that fits your goals. Cancel anytime.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 18, alignItems: "stretch" }}>
              <article className="price-card"><div className="plan">Basic</div><div className="price">₦{plans.BASIC.monthlyNgn.toLocaleString()} <span>/ month</span></div><ul><li>Up to 10 applications per month</li><li>Basic AI CV & cover letter</li><li>Job tracking & notifications</li></ul><Link className="btn btn-white" href={plans.BASIC.ctaHref} style={{ width: "100%" }}>Get started →</Link></article>
              <article className="price-card popular" style={{ borderColor: "#d7f94b" }}><span className="popular-label" style={{ background: "#d7f94b", color: "#111d35" }}>Most popular</span><div className="plan">Premium</div><div className="price">₦{plans.PREMIUM.monthlyNgn.toLocaleString()} <span>/ month</span></div><ul><li>Up to 30 applications per month</li><li>Advanced AI tailoring</li><li>Priority support</li><li>Full application tracking</li></ul><Link className="btn btn-lime" href={plans.PREMIUM.ctaHref} style={{ width: "100%", background: "#d7f94b", color: "#111d35" }}>Get started →</Link></article>
              <article className="price-card"><div className="plan">Max</div><div className="price">₦{plans.MAX.monthlyNgn.toLocaleString()} <span>/ month</span></div><ul><li>Unlimited applications</li><li>Premium AI automation</li><li>Dedicated account</li><li>Advanced analytics</li></ul><Link className="btn btn-white" href={plans.MAX.ctaHref} style={{ width: "100%" }}>Get started →</Link></article>
            </div>
          </div>
        </section>

        {/* CLOSING CTA */}
        <section style={{ background: "#070d1c", padding: "28px 0" }}>
          <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div style={{ color: "#fff" }}><p style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#d7f94b", fontWeight: 800 }}>Ready for your next opportunity?</p><h2 style={{ fontSize: 20, marginTop: 6, color: "#fff" }}>The job you want is still open.</h2><p style={{ color: "#9fb0c6", fontSize: 12, marginTop: 6 }}>Get more interviews, less job hunting, and stay in control.</p></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn btn-lime" href="/signup" style={{ background: "#d7f94b", color: "#111d35" }}>Create free account →</Link>
              <Link className="btn btn-dark" href="/tools" style={{ borderColor: "rgba(255,255,255,.5)", color: "#fff" }}>Try the free tools</Link>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ background: "#070d1c", padding: "36px 0 18px" }}>
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand"><Link href="/" style={{ display: "inline-flex" }}><Image src="/images/logo-wordmark-dark.png" alt="Jobiest" width={550} height={265} style={{ height: 22, width: "auto" }} /></Link><p style={{ color: "#9fb0c6", fontSize: 12, marginTop: 8 }}>Your AI career agent. On-demand, truthful CVs. Approval required.</p></div>
            <div className="footer-col"><strong>Explore</strong><Link href="#how-it-works">How it works</Link><Link href="/tools">Free tools</Link><Link href="#pricing">Pricing</Link></div>
            <div className="footer-col"><strong>Help</strong><Link href="/help">Help centre</Link><a href="mailto:support@jobiest.com">Email support</a></div>
            <div className="footer-col"><strong>Legal</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
          </div>
          <div className="footer-bottom"><span>© 2026 Jobiest. Approval is required; Auto is opt-in only.</span><span>Built in Lagos.</span></div>
        </div>
      </footer>
    </>
  );
}
