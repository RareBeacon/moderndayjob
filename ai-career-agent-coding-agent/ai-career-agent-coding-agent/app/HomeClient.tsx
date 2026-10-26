"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PLANS as PlansType } from "@/lib/billing/pricing";

type Props = { authenticated: boolean; plans: typeof PlansType };

const faqs = [
  { q: "What is Jobiest?", a: "Jobiest helps you find relevant openings, prepare a truthful CV and cover letter from your real experience, and organise your applications. You review and approve everything before it is sent." },
  { q: "Is Jobiest free to try?", a: "Yes. The Free plan lets you explore the tools and includes 3 lifetime AI generations plus 10 career-tool uses per day. No card required to start." },
  { q: "Do you submit applications without my approval?", a: "Never. Approval is always required. You review and edit each CV and cover letter first. Even on paid plans, Auto mode is off by default and only works on supported sites with your explicit opt-in." },
  { q: "Will you invent or exaggerate experience on my CV?", a: "No. Jobiest only uses the experience you provide. If a job asks for something not in your profile, the review step flags it so you can address it honestly." },
  { q: "Which sites can you submit to directly?", a: "Direct submission is limited to supported Greenhouse and Lever workflows. For other sites, Jobiest prepares your application pack and gives you a link to finish the submission yourself. See /supported-systems for the current list." },
  { q: "Can you guarantee interviews or offers?", a: "No. We help you present your real experience clearly, but employers make the hiring decisions. No interview or offer can be guaranteed." },
];

export default function HomeClient({ authenticated, plans }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <>
      <header>
        <div className="container nav" style={{ position: "relative" }}>
          <Link href={authenticated ? "/dashboard" : "/"} aria-label="Jobiest home" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/images/logo-wordmark-light.png" alt="Jobiest" width={544} height={262} priority sizes="156px" style={{ height: 26, width: "auto" }} />
          </Link>
          <nav className="navlinks" aria-label="Main navigation" style={mobileOpen ? { display: "flex", position: "absolute", left: 0, right: 0, top: 60, background: "white", padding: 18, border: "1px solid var(--line)", borderRadius: 16, boxShadow: "var(--shadow)", flexDirection: "column", alignItems: "flex-start", gap: 16, zIndex: 30 } as any : undefined}>
            <Link href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</Link>
            <Link href="/tools" onClick={() => setMobileOpen(false)}>Free tools</Link>
            <Link href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link href="#faq" onClick={() => setMobileOpen(false)}>FAQs</Link>
            <Link href="/about" onClick={() => setMobileOpen(false)}>About</Link>
          </nav>
          <div className="nav-actions">
            <Link className="login" href={authenticated ? "/dashboard" : "/login"}>{authenticated ? "Dashboard" : "Log in"}</Link>
            <Link className="btn btn-lime btn-small" href={authenticated ? "/dashboard" : "/signup"}>{authenticated ? "Go to Dashboard" : "Get started free"} <span aria-hidden>→</span></Link>
            <button className="mobile-toggle" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} aria-controls="primary-nav" onClick={() => setMobileOpen(v => !v)}>{mobileOpen ? "×" : "☰"}</button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* 1. HERO — More interviews. Less job hunting. You choose what gets sent. */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero-grid">
            <div>
              <h1 id="hero-title">More interviews.<br />Less job hunting.<br /><em>You choose what gets sent.</em></h1>
              <p className="hero-copy">
                Jobiest is your AI career agent. Paste any job link and get a truthful CV and cover letter built from your real experience — personalised for that role, not invented. Review, edit, and approve every application before it goes anywhere.
              </p>
              <div className="hero-buttons">
                <Link className="btn btn-lime" href={authenticated ? "/dashboard" : "/signup"}>Create free account <span aria-hidden>→</span></Link>
                <Link className="btn btn-dark" href="#how-it-works">See how it works</Link>
              </div>
              <p className="microtrust"><span aria-hidden>✓</span> Every application requires your approval. Auto-submit is off unless you explicitly opt in on supported sites.</p>
            </div>
            <div className="hero-visual">
              <Image src="/images/hero-person.jpg" alt="Young professional smiling while reviewing a laptop" width={560} height={420} priority style={{ position: "absolute", inset: "15px 0 15px 30px", objectFit: "cover", borderRadius: 26, width: "calc(100% - 30px)", height: "calc(100% - 30px)", boxShadow: "0 24px 70px rgba(0,0,0,.28)" }} />
              <div className="agent-card" role="complementary" aria-label="Application review preview — demo illustration, not live data">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: 12 }}>Job Application Review</strong>
                  <span style={{ fontSize: 10, fontWeight: 800, background: "#fef9c3", color: "#92400e", padding: "5px 8px", borderRadius: 999, border: "1px solid #fde68a" }}>Needs your approval</span>
                </div>
                <div style={{ fontSize: 11, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 12, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><strong style={{ fontSize: 12, color: "var(--navy)" }}>Senior Frontend Developer</strong><br /><small style={{ color: "var(--muted)" }}>TechFusion • Remote • Full-time</small></div>
                  <span style={{ color: "var(--blue)", fontWeight: 700, fontSize: 10 }}>View <span aria-hidden>↗</span></span>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, padding: "9px 10px", border: "1px solid #bbf7d0", borderRadius: 10, background: "#f0fdf4", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span><strong style={{ color: "#15803d" }}>✓ Verified experience</strong><br /><small style={{ color: "var(--muted)" }}>Matched 4 of 5 required skills from your profile</small></span>
                  <span style={{ background: "#fff", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, color: "#15803d", whiteSpace: "nowrap" }}>Verified</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, padding: "9px 10px", border: "1px solid #fed7aa", borderRadius: 10, background: "#fff7ed", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span><strong>⚠ Flagged claim needs review</strong><br /><small style={{ color: "var(--muted)" }}>“5 years at TechCorp” — not found in your profile</small></span>
                  <span style={{ background: "#fff", border: "1px solid #fed7aa", padding: "4px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>Review</span>
                </div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11, background: "#fff" }}><span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 6, background: "#effbdc", marginBottom: 6 }} aria-hidden>📄</span><strong>CV</strong> — Tailored for this role<br /><small style={{ color: "#16a34a", fontWeight: 700 }}>Ready to review <span aria-hidden>→</span></small></div>
                  <div style={{ padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11, background: "#fff" }}><span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 6, background: "#effbdc", marginBottom: 6 }} aria-hidden>✉</span><strong>Cover letter</strong> — Personalised<br /><small style={{ color: "#16a34a", fontWeight: 700 }}>Ready to review <span aria-hidden>→</span></small></div>
                </div>
                <Link className="btn btn-lime" style={{ width: "100%", marginTop: 12, fontSize: 12, padding: 11 }} href={authenticated ? "/applications" : "/signup"}>Review & approve <span aria-hidden>→</span></Link>
                <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>Demo illustration — your data stays private</p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. The reality */}
        <section className="section" aria-labelledby="reality-title">
          <div className="container problem-grid">
            <div>
              <p className="section-kicker">The reality</p>
              <h2 id="reality-title">Job hunting is a full-time job. Without the pay.</h2>
              <p style={{ color: "var(--muted)", marginTop: 10 }}>If you are searching right now, you know the routine by heart.</p>
              <ul className="problem-list">
                <li>You rewrite your CV for every single role.</li>
                <li>You write cover letters late at night.</li>
                <li>You fill in the same forms, again and again.</li>
                <li>You scroll boards on the bus, at lunch, and before sleep.</li>
                <li>And too often — silence.</li>
              </ul>
              <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 6 }}>Doing this for weeks or months is exhausting. It takes energy from the interviews that actually matter. You deserve support, not more busywork.</p>
            </div>
            <div style={{ position: "relative" }}>
              <Image src="/images/life-cafe.jpg" alt="Young woman leaning over laptop at a bright desk, looking thoughtful" width={700} height={520} style={{ width: "100%", height: 410, objectFit: "cover", borderRadius: 26, boxShadow: "var(--shadow)" }} />
              <div className="note" aria-hidden>
                Let Jobiest handle<br />the busy work...
                <span>Research<br />Tailor CV<br />Write cover letter<br />Fill form<br />Follow up</span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. The hard truth — NO invented statistics */}
        <section className="section section-soft" aria-labelledby="truth-title">
          <div className="container problem-grid">
            <div>
              <p className="section-kicker">The hard truth</p>
              <h2 id="truth-title">It’s not you. It’s a demanding process.</h2>
              <p style={{ color: "var(--muted)", marginTop: 8 }}>
                Even qualified, thoughtful applicants can feel overlooked. Job descriptions are vague, forms are repetitive, and small mismatches — a missing keyword, an unclear bullet — can hide the strengths you actually have.
              </p>
              <p style={{ color: "var(--muted)", marginTop: 10, fontSize: 14 }}>
                That does not mean you are the problem. It means the process asks a lot of you, with little feedback. Jobiest helps you present your real experience clearly for each role, so what you have done comes through.
              </p>
              <Link href="#how-it-works" className="btn btn-white" style={{ marginTop: 16, fontSize: 12, padding: "10px 14px" }}>See how Jobiest helps <span aria-hidden>→</span></Link>
            </div>
            <div>
              <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 16, boxShadow: "var(--shadow)", display: "grid", gap: 12 }}>
                <Image src="/images/case-2-jobs.jpg" alt="Illustrative application list showing roles matched to your profile — demo content" width={520} height={240} style={{ width: "100%", height: "auto", borderRadius: 14, border: "1px solid var(--line)" }} />
                <div style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", padding: 12, borderRadius: 12, fontSize: 12 }}>
                  <strong style={{ color: "#15803d" }}>✓ Aligned for review</strong><br />
                  <span style={{ color: "var(--muted)" }}>Keywords kept natural • Skills tied to your profile • Formatting kept readable</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Demo UI — shows how matched skills are surfaced for your review, not a live ATS score.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. How it works */}
        <section className="section" id="how-it-works" aria-labelledby="how-title">
          <div className="container">
            <div className="section-head">
              <p className="section-kicker">How it works</p>
              <h2 id="how-title">Your job search, handled — with you in control.</h2>
              <p>Jobiest finds relevant roles, prepares truthful materials from your experience, and lets you decide what gets sent.</p>
            </div>
            <div className="problem-grid" style={{ alignItems: "start" }}>
              <div style={{ display: "grid", gap: 12 }}>
                <ul className="problem-list" style={{ margin: 0 }}>
                  <li>Finds relevant roles on supported boards (or start from any job link you paste).</li>
                  <li>Drafts a truthful, role-specific CV and cover letter — only from what you have shared.</li>
                  <li>Flags unsupported claims instead of inventing them.</li>
                  <li>You review, edit, and give explicit approval before submission.</li>
                  <li>Tracks status: sent, needs you, or follow-up — so you always know what happened.</li>
                </ul>
                <Link href="/how-it-works" style={{ fontSize: 13, fontWeight: 800, color: "var(--blue)", marginTop: 4 }}>How approval works <span aria-hidden>→</span></Link>
              </div>
              <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 14, boxShadow: "var(--shadow)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, border: "1px solid var(--line)", borderRadius: 12, background: "#f7f9fc" }}>
                  <Image src="/images/case-4-approve.jpg" alt="" width={48} height={48} aria-hidden style={{ borderRadius: 12 }} />
                  <div style={{ fontSize: 12 }}><strong>Application ready for your review</strong><br /><span style={{ color: "var(--muted)" }}>Senior Frontend Developer • Edit any detail before approval</span></div>
                </div>
                <Image src="/images/case-5-morning.jpg" alt="Person checking phone for application updates — illustrative" width={520} height={280} style={{ width: "100%", height: "auto", borderRadius: 14, marginTop: 12, border: "1px solid var(--line)" }} />
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "6px 10px", borderRadius: 999, fontWeight: 700, color: "#15803d" }}>✓ Needs your approval</span>
                  <span style={{ fontSize: 11, background: "#fff7ed", border: "1px solid #fed7aa", padding: "6px 10px", borderRadius: 999, fontWeight: 700 }}>Follow-up ready</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Demo preview — submission status updates in your dashboard after approval.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Three steps — no unverified time claims */}
        <section className="section section-mint" aria-labelledby="steps-title">
          <div className="container">
            <div className="section-head center">
              <p className="section-kicker">Three simple steps</p>
              <h2 id="steps-title">From profile to approved applications.</h2>
              <p>Set your experience once, then reuse it. No guesswork, no starting from scratch each time.</p>
            </div>
            <div className="steps">
              <article className="step">
                <div className="step-number">1</div>
                <h3>Add your details once</h3>
                <p>Tell us about your experience, skills, and goals. Your profile powers every future application — you control what is included.</p>
                <Image src="/images/case-1-criteria.jpg" alt="Profile setup illustration — demo" width={400} height={220} style={{ width: "100%", height: "auto", borderRadius: 12, marginTop: 14, border: "1px solid var(--line)" }} />
              </article>
              <article className="step">
                <div className="step-number">2</div>
                <h3>Tailor and apply</h3>
                <p>Paste a job link or pick a discovered role. Jobiest drafts a truthful CV and cover letter for that role — you review and approve.</p>
                <Image src="/images/case-3-tailor.jpg" alt="Document tailoring illustration — demo" width={400} height={220} style={{ width: "100%", height: "auto", borderRadius: 12, marginTop: 14, border: "1px solid var(--line)" }} />
              </article>
              <article className="step">
                <div className="step-number">3</div>
                <h3>Track and follow up</h3>
                <p>See sent, needs-you, and follow-up states. Get guidance when a site needs your attention — you stay in control.</p>
                <Image src="/images/overnight-run.jpg" alt="Application tracker illustration — demo" width={400} height={220} style={{ width: "100%", height: "auto", borderRadius: 12, marginTop: 14, border: "1px solid var(--line)" }} />
              </article>
            </div>
          </div>
        </section>

        {/* 6. Free tools + Features */}
        <section className="section" id="free-tools" aria-labelledby="tools-title">
          <div className="container">
            <div className="section-head">
              <p className="section-kicker">Free career tools</p>
              <h2 id="tools-title">Start with what you need — no account required for the tools.</h2>
              <p>Ten tools that use your real profile and the actual job description. No invented achievements.</p>
            </div>
            <div className="tools-grid">
              <Link className="tool" href="/free-ats-resume-scanner"><div className="feature-icon" aria-hidden>▤</div><strong>Resume Scanner</strong><p>Check readability and missing details.</p></Link>
              <Link className="tool" href="/free-job-description-analyzer"><div className="feature-icon" aria-hidden>⌕</div><strong>Job Analyzer</strong><p>Understand what the employer asked for.</p></Link>
              <Link className="tool" href="/free-cover-letter-writer"><div className="feature-icon" aria-hidden>✉</div><strong>Cover Letter Writer</strong><p>Role-specific draft from your experience.</p></Link>
              <Link className="tool" href="/free-resume-summary-generator"><div className="feature-icon" aria-hidden>✎</div><strong>Resume Summary</strong><p>Truthful summary options.</p></Link>
              <Link className="tool" href="/free-linkedin-headline-builder"><div className="feature-icon" aria-hidden>in</div><strong>LinkedIn Headline</strong><p>Clear headline from real roles.</p></Link>
            </div>
            <Link className="btn btn-white" href="/tools" style={{ marginTop: 18, fontSize: 12, padding: "10px 14px" }}>Explore all 10 tools <span aria-hidden>→</span></Link>
          </div>
        </section>

        {/* 7. Pricing — ONLY verified values from lib/billing/pricing.ts */}
        <section className="section section-soft" id="pricing" aria-labelledby="pricing-title">
          <div className="container">
            <div className="section-head center">
              <p className="section-kicker">Pricing</p>
              <h2 id="pricing-title">Start free. Upgrade only if it helps.</h2>
              <p>All prices in Naira, billed monthly. Features and limits below are from the live billing config. USD prices shown on the pricing page.</p>
            </div>
            <div className="pricing-grid">
              <article className="price-card">
                <div className="plan">Free</div>
                <div className="price">₦{plans.FREE.monthlyNgn.toLocaleString()} <span>forever</span></div>
                <div className="price-desc">{plans.FREE.tagline}</div>
                <ul>
                  <li>3 AI generations total (lifetime, not daily)</li>
                  <li>10 career-tool uses per day</li>
                  <li>Paste any job link for analysis</li>
                  <li>Profile builder & application tracker</li>
                </ul>
                <Link className="btn btn-white" href={plans.FREE.ctaHref}>{plans.FREE.cta} <span aria-hidden>→</span></Link>
              </article>
              <article className="price-card">
                <div className="plan">Basic</div>
                <div className="price">₦{plans.BASIC.monthlyNgn.toLocaleString()} <span>/ month</span></div>
                <div className="price-desc">{plans.BASIC.tagline}</div>
                <ul>
                  <li>3 AI generations per day</li>
                  <li>50 tool uses per day</li>
                  <li>2 auto-apply trial runs (lifetime)</li>
                  <li>Approval required; Auto only with opt-in</li>
                </ul>
                <Link className="btn btn-white" href={plans.BASIC.ctaHref}>{plans.BASIC.cta} <span aria-hidden>→</span></Link>
              </article>
              <article className="price-card popular" aria-label="Most popular plan">
                <span className="popular-label">Most popular</span>
                <div className="plan">Premium</div>
                <div className="price">₦{plans.PREMIUM.monthlyNgn.toLocaleString()} <span>/ month</span></div>
                <div className="price-desc">{plans.PREMIUM.tagline}</div>
                <ul>
                  <li>10 AI generations per day</li>
                  <li>Agent finds matching jobs daily</li>
                  <li>10 applications per day (approve each, or Auto with opt-in)</li>
                  <li>Unlimited career-tool uses</li>
                </ul>
                <Link className="btn btn-lime" href={plans.PREMIUM.ctaHref}>{plans.PREMIUM.cta} <span aria-hidden>→</span></Link>
              </article>
              <article className="price-card">
                <div className="plan">Max</div>
                <div className="price">₦{plans.MAX.monthlyNgn.toLocaleString()} <span>/ month</span></div>
                <div className="price-desc">{plans.MAX.tagline}</div>
                <ul>
                  <li>20 AI generations per day</li>
                  <li>Daily matching-job discovery</li>
                  <li>20 applications per day (approve each, or Auto with opt-in)</li>
                  <li>Unlimited everything</li>
                </ul>
                <Link className="btn btn-white" href={plans.MAX.ctaHref}>{plans.MAX.cta} <span aria-hidden>→</span></Link>
              </article>
            </div>
            <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginTop: 14 }}>Live config: {plans.BASIC.monthlyUsd ? `$${plans.BASIC.monthlyUsd}/mo Basic` : ""} · {plans.PREMIUM.monthlyUsd ? `$${plans.PREMIUM.monthlyUsd}/mo Premium` : ""} · Cancel anytime. See /pricing for full entitlements.</p>
            <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginTop: 6 }}>If any pricing above is unclear, we preserved source values and did not guess — confirm with product owner before publishing changes.</p>
          </div>
        </section>

        {/* FAQs */}
        <section className="section" id="faq" aria-labelledby="faq-title">
          <div className="container">
            <div className="section-head center"><p className="section-kicker">FAQs</p><h2 id="faq-title">Straight answers.</h2></div>
            <div className="faq-list" role="list">
              {faqs.map((f, i) => (
                <div key={f.q} className={`faq-item${openFaq === i ? " open" : ""}`} role="listitem">
                  <button className="faq-question" aria-expanded={openFaq === i} aria-controls={`faq-${i}`} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span>{f.q}</span><span aria-hidden>{openFaq === i ? "−" : "+"}</span>
                  </button>
                  <div id={`faq-${i}`} className="faq-answer" style={{ display: openFaq === i ? "block" : "none" }}>{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="final-cta" aria-labelledby="cta-title">
          <div className="container cta-inner">
            <div>
              <p className="section-kicker" style={{ color: "#d7f94b", marginBottom: 8 }}>You stay in control</p>
              <h2 id="cta-title" style={{ color: "#fff", fontSize: "clamp(28px,3.2vw,40px)", margin: 0 }}>The work you want is closer than it feels.</h2>
              <p style={{ color: "#cbd5e1", marginTop: 8, maxWidth: 560 }}>Create your profile from real experience, review every draft, and choose what gets sent. Your privacy and your decisions come first.</p>
            </div>
            <div className="cta-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn btn-lime" href={authenticated ? "/dashboard" : "/signup"}>Create free account <span aria-hidden>→</span></Link>
              <Link className="btn btn-dark" href="/privacy" style={{ borderColor: "rgba(255,255,255,.5)" }}>How we handle your data</Link>
            </div>
          </div>
        </section>
      </main>

      <footer id="footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <Link href={authenticated ? "/dashboard" : "/"} style={{ display: "inline-flex" }} aria-label="Jobiest home">
                <Image src="/images/logo-wordmark-dark.png" alt="Jobiest" width={550} height={265} loading="lazy" sizes="144px" style={{ height: 24, width: "auto" }} />
              </Link>
              <p>Truthful applications from your experience. You review and approve every send. See <Link href="/supported-systems" style={{ color: "#d7f94b", textDecoration: "underline" }}>supported systems</Link> for where direct submission is available.</p>
            </div>
            <div className="footer-col"><strong>Explore</strong><Link href="#how-it-works">How it works</Link><Link href="/tools">Free tools</Link><Link href="#pricing">Pricing</Link><Link href="/about">About</Link></div>
            <div className="footer-col"><strong>Support</strong><Link href="/help">Help centre</Link><a href="mailto:support@jobiest.com">Email support</a><Link href="#faq">FAQs</Link></div>
            <div className="footer-col"><strong>Legal</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refund">Refunds</Link></div>
          </div>
          <div className="footer-bottom"><span>© 2026 Jobiest. Approval is required; Auto is opt-in only.</span><span>Images are licensed assets; demo cards are illustrative.</span></div>
        </div>
      </footer>
    </>
  );
}
