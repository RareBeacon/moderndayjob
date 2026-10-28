"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CirclePlay,
  FileText,
  Layers,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  FileCheck,
  PenLine,
  Send,
} from "lucide-react";

const heroImage = "/images/jobiest-hero.jpg";
const realityImage = "/images/jobiest-reality.jpg";
const howImage = "/images/jobiest-how.jpg";
const pricingImage = "/images/jobiest-future.jpg";

// ---------- Reusable animation primitives ----------
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener?.("change", h);
    return () => m.removeEventListener?.("change", h);
  }, []);
  return reduced;
}

function TypingHurray({ onDone }: { onDone?: () => void }) {
  const reduced = useReducedMotion();
  const full = "Hurray...";
  const steps = ["H", "Hu", "Hur", "Hurr", "Hurra", "Hurray", "Hurray.", "Hurray..", "Hurray..."];
  const [idx, setIdx] = useState(reduced ? steps.length - 1 : 0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    // check session to not replay every visit
    try {
      if (sessionStorage.getItem("jobiest-hero-played") === "1") {
        setIdx(steps.length - 1);
        setShowCursor(false);
        onDone?.();
        return;
      }
    } catch {}
    let i = 0;
    const timers: number[] = [];
    const tick = () => {
      if (i < steps.length - 1) {
        i += 1;
        setIdx(i);
        const delay = i === steps.length - 1 ? 320 : i >= 6 ? 160 : 130;
        timers.push(window.setTimeout(tick, delay));
      } else {
        // hold then remove cursor
        timers.push(window.setTimeout(() => setShowCursor(false), 380));
        timers.push(window.setTimeout(() => {
          try { sessionStorage.setItem("jobiest-hero-played", "1"); } catch {}
          onDone?.();
        }, 420));
      }
    };
    timers.push(window.setTimeout(tick, 260));
    return () => timers.forEach(clearTimeout);
  }, [reduced, onDone]);

  return (
    <span aria-label="Hurray" aria-live="polite" className="hurray-typing">
      {steps[idx]}
      {showCursor && !reduced && <span className="typing-cursor" aria-hidden="true">|</span>}
    </span>
  );
}

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!els.length) return;
    // if reduced motion, show immediately
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ---------- Logos ----------
function Logo({ variant = "light" }: { variant?: "light" | "dark" }) {
  const src = variant === "dark" ? "/logo-wordmark-dark.svg" : "/logo-wordmark-light.svg";
  return (
    <a href="#top" className="brand" aria-label="Jobiest home">
      <img src={src} alt="Jobiest" className="header-logo-image" width={128} height={42} />
    </a>
  );
}
function FooterLogo() {
  return (
    <a href="#top" className="brand footer-wordmark" aria-label="Jobiest home">
      <img src="/logo-wordmark-light.svg" alt="Jobiest" className="footer-logo-image" width={160} height={58} />
    </a>
  );
}
function Button({ children, href = "/signup", variant = "primary" }: { children: React.ReactNode; href?: string; variant?: "primary" | "ghost" }) {
  const cls = variant === "ghost" ? "button button-ghost" : "button";
  return (
    <a className={cls} href={href}>
      {children} <ArrowRight size={15} strokeWidth={2.5} />
    </a>
  );
}

// ---------- Product visuals ----------
function ApprovalCard() {
  return (
    <div className="approval-card">
      <div className="approval-head">
        <div>
          <span className="eyebrow">Job Application Review</span>
          <strong>Senior Frontend Developer</strong>
        </div>
        <span className="status status-lime">Needs your approval</span>
      </div>
      <div className="approval-rule"><Check size={13} /><span>CV tailored to this role</span><b>View</b></div>
      <div className="approval-rule"><Check size={13} /><span>Matches 4/5 required skills</span><b>Verified</b></div>
      <div className="approval-rule warn"><Sparkles size={13} /><span>Flagged unsupported claim</span><b>Review</b></div>
      <div className="approval-rule"><FileText size={13} /><span>CV <small>Tailored for this role</small></span><b>Ready</b></div>
      <div className="approval-rule"><FileText size={13} /><span>Cover letter <small>AI generated and personalised</small></span><b>Ready</b></div>
      <button className="approval-action">Review & approve <ArrowRight size={14} /></button>
    </div>
  );
}
function JobOpportunityCard() {
  return (
    <div className="mini-card">
      <div className="mini-card-head">
        <span className="mini-dot" /> Product Designer • Lagos • Full-time
      </div>
      <strong>Senior Product Designer — Fintech</strong>
      <p>Build clear, human application experiences. Work with a team that values truthful, tailored applications.</p>
      <div className="mini-tags"><span>ATS friendly</span><span>3+ yrs</span><span>Remote</span></div>
    </div>
  );
}
function CVPreview() {
  return (
    <div className="cv-preview">
      <div className="cv-head"><span /><span /><span /></div>
      <div className="cv-name">Alex Morgan — Product Designer</div>
      <div className="cv-line w-80" /><div className="cv-line w-60" />
      <div className="cv-section">Experience</div>
      <div className="cv-line w-90" /><div className="cv-line w-75" /><div className="cv-line w-85" />
      <div className="cv-highlight">Relevant experience highlighted for this role</div>
    </div>
  );
}

export default function Home({ authenticated }: { authenticated?: boolean } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [heroStage, setHeroStage] = useState(0); // 0 typing, 1 headline, 2 copy, 3 cta, 4 visual
  const heroRef = useRef<HTMLElement>(null);

  useScrollReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // hero sequencing: typing done -> headline -> copy -> ctas -> visual
  const handleTypingDone = () => {
    setHeroStage(1);
    // stagger rest quickly 2-4s total
    window.setTimeout(() => setHeroStage(2), 260);
    window.setTimeout(() => setHeroStage(3), 560);
    window.setTimeout(() => setHeroStage(4), 860);
  };

  // if reduced motion, skip typing staging
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHeroStage(4);
    }
  }, []);

  const plans = [
    { name: "Basic", price: "₦5,000", popular: false, features: ["Up to 10 applications per month", "AI-tailored CV & cover letter", "Job tracking & notifications"] },
    { name: "Premium", price: "₦10,000", popular: true, features: ["Up to 30 applications per month", "Advanced AI tailoring", "Priority support", "Full application tracking"] },
    { name: "Max", price: "₦20,000", popular: false, features: ["Unlimited applications", "Premium AI assistance", "Dedicated support", "Advanced application tracking"] },
  ];

  return (
    <div className="site-shell" id="top">
      <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-wrap">
          <Logo variant="dark" />
          <nav className={menuOpen ? "nav-links open" : "nav-links"}>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#steps" onClick={() => setMenuOpen(false)}>Free tools</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <a href="#footer" onClick={() => setMenuOpen(false)}>Blog</a>
            <a href="#footer" onClick={() => setMenuOpen(false)}>About</a>
          </nav>
          <div className="nav-actions">
            <a className="login-link" href="/login">Log in</a>
            <a className="button" href="/signup">Get started free <ArrowRight size={15} strokeWidth={2.5} /></a>
          </div>
          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main id="main">
        {/* HERO — signature animation */}
        <section className="hero hero-premium" ref={heroRef} data-reveal>
          <div className="container hero-grid">
            <div className="hero-copy-col">
              <div className="hero-eyebrow" aria-hidden={heroStage < 1 ? "true" : "false"}>
                <TypingHurray onDone={handleTypingDone} />
              </div>

              <h1 className={`hero-headline ${heroStage >= 1 ? "is-in" : ""}`}>
                <span className="hl-line">You can now search and apply</span>
                <span className="hl-line">for jobs without spending hours</span>
                <span className="hl-line">searching the internet, creating</span>
                <span className="hl-line">tailored CVs, and filling out the</span>
                <span className="hl-line">same forms over and over again.</span>
              </h1>

              <p className={`hero-support ${heroStage >= 2 ? "is-in" : ""}`}>
                Jobiest is designed to take the busywork off your shoulders, so you can focus on landing the job you deserve.
              </p>

              <div className={`hero-ctas ${heroStage >= 3 ? "is-in" : ""}`}>
                <Button href="/signup">Start for free</Button>
                <a href="#how-it-works" className="button button-ghost"><CirclePlay size={16} /> See how it works</a>
              </div>

              <div className="hero-note">
                <ShieldCheck size={14} /> You approve every application before it goes anywhere.
              </div>
            </div>

            <div className={`hero-visual-col ${heroStage >= 4 ? "is-in" : ""}`} aria-hidden={heroStage < 4 ? "true" : "false"}>
              <div className="hero-visual-stack">
                <div className="hv-card hv-job" data-reveal><JobOpportunityCard /></div>
                <div className="hv-card hv-approval" data-reveal><ApprovalCard /></div>
              </div>
            </div>
          </div>
          <div className="scroll-indicator" aria-hidden="true"><span /></div>
        </section>

        {/* SECTION 2 — The problem */}
        <section className="story-section problem light" data-reveal>
          <div className="container">
            <div className="section-intro center" data-reveal>
              <h2>We all know how time-demanding job hunting can be...</h2>
            </div>
            <div className="split-layout">
              <div className="story-copy" data-reveal>
                <ul className="check-list editorial">
                  <li data-reveal><span><Check size={12} /></span>You wake up in the morning.</li>
                  <li data-reveal><span><Check size={12} /></span>You spend hours looking for relevant job opportunities.</li>
                  <li data-reveal><span><Check size={12} /></span>You create different tailored resumes for each job.</li>
                  <li data-reveal><span><Check size={12} /></span>You fill out different forms over and over again.</li>
                  <li data-reveal><span><Check size={12} /></span>You keep relying on hope.</li>
                </ul>
                <p className="muted" data-reveal>We all know how exhausting these activities can be.</p>
                <p className="closing-strong" data-reveal>
                  That's why Jobiest is designed to relieve you of the stress. Jobiest is here to help you apply for more jobs by working less and getting more interviews.
                </p>
              </div>
              <div className="problem-visual" data-reveal>
                <div className="browser-mock">
                  <div className="browser-bar"><span /><span /><span /></div>
                  <div className="tab-stack">
                    <div className="tab">Product Designer – Lagos</div>
                    <div className="tab">Frontend Dev – Remote</div>
                    <div className="tab">UX Writer – Fintech</div>
                    <div className="tab muted">+ 12 more tabs</div>
                  </div>
                  <div className="form-stack">
                    <div className="form-row"><span /> <i /></div>
                    <div className="form-row"><span /> <i /></div>
                    <div className="form-row"><span /> <i /></div>
                  </div>
                </div>
                <div className="cv-stack">
                  <div className="cv-doc">CV — TechCo</div>
                  <div className="cv-doc">CV — HealthCo</div>
                  <div className="cv-doc">CV — EduCo</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 — The reality */}
        <section className="story-section reality" data-reveal>
          <div className="container split-layout">
            <div className="story-copy editorial-copy" data-reveal>
              <span className="kicker">The reality — listen up</span>
              <h2><span className="emphasis">You are not lazy.</span><br />You are maxed out.</h2>
              <p>
                You give 100% at work. You show up for family. You pay the bills. Then, in the cracks between dinner and sleep, you are supposed to launch a second full-time job called job hunting. Of course you are exhausted. That is not a you problem. <strong>That is a system problem.</strong>
              </p>
              <p className="muted">You saved that perfect role at lunch. You swore you'd apply tonight. Life happened. The tab is still open 6 days later.</p>
              <p>You've rewritten the same CV 5 times to sound like the person you already are. It shouldn't be this hard.</p>
              <p>You retype your entire work history into another form, field by field, praying this one lands.</p>
              <p>You job hunt on the bus, after dinner, in the stolen minutes that were meant for you.</p>
              <p>And when silence hits, starting the next one costs you a little more. That's not weakness. That's a broken process.</p>
              <p className="closing-strong">Here is what winners understand: a slow reply does not mean you are not good enough. It means your value was not positioned right. Jobiest handles the repetitive positioning work so you can save your energy for the conversations that actually move your life forward.</p>
            </div>
            <div className="story-visual" style={{ backgroundImage: `url(${realityImage})` }} data-reveal>
              <div className="scribble">Let Jobiest handle<br />the busy work… <ArrowRight size={23} /></div>
              <div className="task-stack">
                <div>Find relevant roles</div><div>Tailor your CV</div><div>Write your letter</div><div>Complete the form</div><div>Prepare to submit</div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4 — The solution workflow */}
        <section className="story-section solution light" data-reveal>
          <div className="container">
            <div className="section-intro" data-reveal>
              <h2>Let Jobiest handle the busywork...</h2>
            </div>
            <div className="workflow">
              <div className="wf-step" data-reveal><span className="wf-icon"><Search size={18} /></span><strong>Find relevant roles</strong><small>Matched to your experience</small></div>
              <div className="wf-connector" aria-hidden="true" />
              <div className="wf-step" data-reveal><span className="wf-icon"><FileCheck size={18} /></span><strong>Tailor your CV</strong><small>Truthful, role-specific</small></div>
              <div className="wf-connector" aria-hidden="true" />
              <div className="wf-step" data-reveal><span className="wf-icon"><PenLine size={18} /></span><strong>Write your letter</strong><small>Clear and personal</small></div>
              <div className="wf-connector" aria-hidden="true" />
              <div className="wf-step" data-reveal><span className="wf-icon"><Layers size={18} /></span><strong>Complete the form</strong><small>Fields prepared</small></div>
              <div className="wf-connector" aria-hidden="true" />
              <div className="wf-step" data-reveal><span className="wf-icon"><Send size={18} /></span><strong>Prepare to submit</strong><small>Review then approve</small></div>
            </div>
            <div className="solution-visuals" data-reveal>
              <JobOpportunityCard />
              <CVPreview />
              <div className="letter-preview"><strong>Cover letter</strong><p>Tailored to this role from your real experience — no invented credentials.</p><span>Ready for review</span></div>
            </div>
            <p className="muted center" data-reveal>Every step stays truthful. You review everything before it is ready to send.</p>
          </div>
        </section>

        {/* SECTION 5 — The hard truth */}
        <section className="story-section truth" data-reveal>
          <div className="container split-layout reverse">
            <div className="story-copy" data-reveal>
              <h2>It is not a talent problem. It is a translation problem.</h2>
              <p>You know what you can do. But hiring platforms are crowded, forms make you repeat your story 10 times, and rushed applications bury your best work. High performers do not lose because they lack skill. They lose because their experience does not get translated for each role.</p>
              <p className="muted">Your experience deserves a fair shot. Jobiest puts it into words for each job — without inventing credentials, without taking the decision from you. Truthful. Specific. Yours.</p>
              <a className="text-link" href="#how-it-works">Put your experience in the right places <ArrowRight size={15} /></a>
              <div className="benefits-inline" data-reveal>
                <span><Check size={12} /> ATS Optimised</span><span><Check size={12} /> Keywords matched</span><span><Check size={12} /> Skills aligned</span><span><Check size={12} /> Formatting ready</span>
              </div>
            </div>
            <div className="laptop-visual" data-reveal>
              <div className="laptop">
                <div className="screen">
                  <div className="screen-bar" />
                  <div className="screen-lines"><i /><i /><i /><i /><i /></div>
                  <div className="highlight-row"><Check size={12} /> Relevant experience highlighted</div>
                </div>
                <div className="laptop-base" />
              </div>
              <div className="ats-card">
                <span className="check-bubble"><Check size={14} /></span><strong>ATS Optimised</strong>
                <p><Check size={12} /> Keywords matched</p><p><Check size={12} /> Skills aligned</p><p><Check size={12} /> Formatting ready</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6 — How it works */}
        <section className="story-section how" id="how-it-works" data-reveal>
          <div className="container split-layout">
            <div className="story-copy" data-reveal>
              <h2>Your job search, handled. You stay in control.</h2>
              <p>You set the direction. Jobiest does the heavy lifting. You make the final call on everything that gets sent. That is how pros play this game.</p>
              <div className="how-steps">
                <div className="how-step" data-reveal><strong>Find the right doors</strong><p>Find roles that actually fit your experience and goals, not random noise.</p></div>
                <div className="how-step" data-reveal><strong>Position yourself right</strong><p>Prepare a truthful, tailored CV and cover letter for each role, built from your real work.</p></div>
                <div className="how-step" data-reveal><strong>You approve or edit</strong><p>Nothing is submitted until you say yes. Flagged claims are surfaced for review.</p></div>
                <div className="how-step" data-reveal><strong>Track and follow through</strong><p>Spend your saved hours preparing to win the interview, not refilling forms.</p></div>
              </div>
              <Button href="/signup">Start for free</Button>
            </div>
            <div className="story-visual how-visual" style={{ backgroundImage: `url(${howImage})` }} data-reveal>
              <div className="scribble dark-scribble">Less effort.<br />More opportunities.<ArrowRight size={23} /></div>
              <div className="floating-notification"><span className="check-bubble"><Check size={13} /></span><div><strong>Application submitted!</strong><small>Only after your approval</small></div><ChevronRight size={16} /></div>
            </div>
          </div>
        </section>

        {/* SECTION 7 — Three simple steps */}
        <section className="steps-section" id="steps" data-reveal>
          <div className="container">
            <div className="section-intro" data-reveal>
              <h2>Three steps. Fifteen minutes. Then it runs for you.</h2>
              <p>Amateurs make job hunting complicated. Pros make it systematic. Tell us what you want. We handle the repetitive parts. You keep the decision.</p>
            </div>
            <div className="steps-grid">
              <div className="step-card" data-reveal><div className="step-number">1</div><div className="step-icon"><BriefcaseBusiness size={20} /></div><h3>Declare your next move</h3><p>Tell us what you have done, what you are great at, and what your next chapter looks like. Clarity first.</p></div>
              <div className="step-card" data-reveal><div className="step-number">2</div><div className="step-icon"><Sparkles size={20} /></div><h3>We position you</h3><p>Jobiest finds fitting roles and builds a truthful, tailored application for each. You inspect every word before it is ready.</p><span className="mini-tag">Takes ~15 minutes</span></div>
              <div className="step-card" data-reveal><div className="step-number">3</div><div className="step-icon"><Search size={20} /></div><h3>You call the shots</h3><p>Approve only what feels right. Track every submission. Use the hours you saved to prepare like a closer.</p></div>
            </div>
          </div>
        </section>

        {/* SECTION 8 — Pricing */}
        <section className="pricing-section" id="pricing" data-reveal>
          <div className="container pricing-wrap">
            <div className="pricing-copy" data-reveal>
              <span className="kicker">Pricing — invest, do not expense</span>
              <h2>Start free. Upgrade when you feel the lift.</h2>
              <p>This is not a cost. It is leverage. Choose the level that matches your ambition. Cancel anytime — your next move stays yours.</p>
              <div className="pricing-grid">
                {plans.map((plan, idx) => (
                  <div key={plan.name} className={plan.popular ? "price-card popular" : "price-card"} data-reveal style={{ transitionDelay: `${idx * 80}ms` }}>
                    {plan.popular && <span className="popular-tag">Most popular</span>}
                    <div className="plan-name">{plan.name}</div>
                    <div className="price">{plan.price}<small> / month</small></div>
                    <div className="price-rule" />
                    {plan.features.map((f) => <div key={f} className="plan-feature"><Check size={13} />{f}</div>)}
                    <a href="/signup" className="plan-button">Get started <ArrowRight size={14} /></a>
                  </div>
                ))}
              </div>
            </div>
            <div className="pricing-image" style={{ backgroundImage: `url(${pricingImage})` }} data-reveal>
              <div className="image-note">Invest in<br />your future <span>♡</span></div>
            </div>
          </div>
        </section>

        {/* SECTION 9 — Final CTA */}
        <section className="bottom-cta" data-reveal>
          <div className="container cta-inner" data-reveal>
            <div className="cta-thumb" style={{ backgroundImage: `url(${heroImage})` }} />
            <div>
              <span className="kicker kicker-light">Invest in your future ♡</span>
              <h2>The job you want is still open.</h2>
              <p>Ready to play at a higher level? Stop leaving it to chance. Let Jobiest handle the busywork — with your approval at every step — so you can show up ready to win.</p>
            </div>
            <Button href="/signup">Create free account</Button>
            <a className="button button-ghost" href="#how-it-works">See how it works</a>
          </div>
        </section>
      </main>

      <footer id="footer" data-reveal>
        <div className="container footer-top">
          <div className="footer-brand">
            <FooterLogo />
            <p>Your AI career agent. Truthful. On-demand. Yours.</p>
            <span>You're in control.</span>
          </div>
          <div className="footer-links">
            <div><strong>Explore</strong><a href="#how-it-works">How it works</a><a href="#steps">Free tools</a><a href="#pricing">Pricing</a><a href="#footer">Blog</a></div>
            <div><strong>Help</strong><a href="#footer">Support</a><a href="#footer">Email support</a><a href="#footer">Terms &amp; privacy</a></div>
          </div>
          <div className="socials"><a href="#footer" aria-label="X">X</a><a href="#footer" aria-label="LinkedIn">in</a><a href="#footer" aria-label="Instagram">IG</a></div>
        </div>
        <div className="container footer-bottom">
          <span>© 2025 Jobiest. Nothing is submitted without your approval.</span>
          <span>Better jobs.<br /><em>Brighter futures.</em> <Sparkles size={14} /></span>
        </div>
      </footer>
    </div>
  );
}
