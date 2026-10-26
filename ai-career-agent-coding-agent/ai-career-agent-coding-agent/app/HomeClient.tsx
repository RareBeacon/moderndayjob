"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CirclePlay,
  FileText,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

const heroImage = "/images/jobiest-hero.jpg";
const realityImage = "/images/jobiest-reality.jpg";
const howImage = "/images/jobiest-how.jpg";
const pricingImage = "/images/jobiest-future.jpg";

// Dan Lok style copy — direct, high-status, no fluff, truth preserved, no guarantees
const checks = [
  "You saved that perfect role at lunch. You swore you'd apply tonight. Life happened. The tab is still open 6 days later.",
  "You've rewritten the same CV 5 times to sound like the person you already are. It shouldn't be this hard.",
  "You retype your entire work history into another form, field by field, praying this one lands.",
  "You job hunt on the bus, after dinner, in the stolen minutes that were meant for you.",
  "And when silence hits, starting the next one costs you a little more. That's not weakness. That's a broken process.",
];

const plans = [
  { name: "Basic", price: "₦5,000", detail: "monthly", features: ["Up to 10 applications per month", "AI-tailored CV & cover letter", "Job tracking & notifications"] },
  { name: "Premium", price: "₦10,000", detail: "monthly", popular: true, features: ["Up to 30 applications per month", "Advanced AI tailoring", "Priority support", "Full application tracking"] },
  { name: "Max", price: "₦20,000", detail: "monthly", features: ["Unlimited applications", "Premium AI assistance", "Dedicated support", "Advanced application tracking"] },
];

function Logo() {
  return (
    <a href="#top" className="brand" aria-label="Jobiest home">
      <img src="/logo-wordmark-light.jpg" alt="Jobiest" className="header-logo-image" width={108} height={36} />
    </a>
  );
}

function FooterLogo() {
  return (
    <a href="#top" className="brand footer-wordmark" aria-label="Jobiest home">
      <img src="/logo-wordmark-light.jpg" alt="Jobiest" className="footer-logo-image" width={142} height={54} />
    </a>
  );
}

function Button({ children, secondary = false, href = "/signup" }: { children: React.ReactNode; secondary?: boolean; href?: string }) {
  return (
    <a className={secondary ? "button button-secondary" : "button"} href={href}>
      {children}
      <ArrowRight size={15} strokeWidth={2.5} />
    </a>
  );
}

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
      <div className="approval-rule">
        <Check size={13} />
        <span>CV tailored to this role</span>
        <b>View</b>
      </div>
      <div className="approval-rule">
        <Check size={13} />
        <span>Matches 4/5 required skills</span>
        <b>Verified</b>
      </div>
      <div className="approval-rule warn">
        <Sparkles size={13} />
        <span>Flagged unsupported claim</span>
        <b>Review</b>
      </div>
      <div className="approval-rule">
        <FileText size={13} />
        <span>
          CV <small>Tailored for this role</small>
        </span>
        <b>Ready</b>
      </div>
      <div className="approval-rule">
        <FileText size={13} />
        <span>
          Cover letter <small>AI generated and personalised</small>
        </span>
        <b>Ready</b>
      </div>
      <button className="approval-action">
        Review & approve <ArrowRight size={14} />
      </button>
    </div>
  );
}

function StepCard({ number, icon, title, children, tag }: { number: string; icon: React.ReactNode; title: string; children: React.ReactNode; tag?: string }) {
  return (
    <div className="step-card">
      <div className="step-number">{number}</div>
      <div className="step-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {tag && <span className="mini-tag">{tag}</span>}
    </div>
  );
}

export default function Home({ authenticated }: { authenticated?: boolean } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [parallax, setParallax] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      setParallax(window.scrollY * 0.12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Scroll reveal for every row
    const els = document.querySelectorAll<HTMLElement>("[data-animate]");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = `${Math.min(i % 3, 2) * 80}ms`;
      io.observe(el);
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    <div className="site-shell" id="top">
      <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-wrap">
          <Logo />
          <nav className={menuOpen ? "nav-links open" : "nav-links"}>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              How it works
            </a>
            <a href="#steps" onClick={() => setMenuOpen(false)}>
              Free tools
            </a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>
              Pricing
            </a>
            <a href="#footer" onClick={() => setMenuOpen(false)}>
              Blog
            </a>
            <a href="#footer" onClick={() => setMenuOpen(false)}>
              About
            </a>
          </nav>
          <div className="nav-actions">
            <a className="login-link" href="/login">
              Log in
            </a>
            <a className="button" href="/signup">
              Get started free
              <ArrowRight size={15} strokeWidth={2.5} />
            </a>
          </div>
          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main>
        <section
          className="hero"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(3,17,28,.96) 0%, rgba(3,17,28,.82) 36%, rgba(3,17,28,.16) 74%), url(${heroImage})`,
            backgroundPosition: `center calc(50% + ${parallax}px)`,
          }}
        >
          <div className="container hero-content">
            <div className="hero-copy" data-animate="fade-up">
              <h1>
                Land more
                <br />
                interviews.
                <br />
                <span>Skip the busywork.</span>
                <br />
                <span>Get closer to work you love.</span>
              </h1>
              <p>
                Let us be blunt: hiring managers do not hire the most qualified. They hire the most clearly relevant. Paste any job link and
                Jobiest turns your real experience into a tight, tailored application in minutes — truthful, specific, ready to review. You see
                everything. You approve everything. Nothing goes out without your say-so.
              </p>
              <div className="hero-actions">
                <Button>Start for free</Button>
                <a href="#how-it-works" className="button button-ghost">
                  <CirclePlay size={16} /> See how it works
                </a>
              </div>
              <div className="hero-note">
                <ShieldCheck size={14} /> You approve every application before it goes anywhere.
              </div>
            </div>
            <div data-animate="fade-left">
              <ApprovalCard />
            </div>
          </div>
          <div className="hero-dots" data-animate="fade">
            •••••
          </div>
          <div className="scroll-indicator" aria-hidden="true">
            <span />
          </div>
        </section>

        <section className="story-section reality" data-animate="fade-up">
          <div className="container split-layout">
            <div className="story-copy">
              <span className="kicker">The reality — listen up</span>
              <h2>
                You are not lazy.
                <br />
                You are maxed out.
              </h2>
              <p>
                You give 100% at work. You show up for family. You pay the bills. Then, in the cracks between dinner and sleep, you are
                supposed to launch a second full-time job called job hunting. Of course you are exhausted. That is not a you problem. That is
                a system problem.
              </p>
              <ul className="check-list">
                {checks.map((item, idx) => (
                  <li key={item} data-animate="fade-up" style={{ transitionDelay: `${idx * 60}ms` }}>
                    <span>
                      <Check size={12} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="muted">
                Here is what winners understand: a slow reply does not mean you are not good enough. It means your value was not positioned
                right. Jobiest handles the repetitive positioning work so you can save your energy for the conversations that actually move
                your life forward.
              </p>
            </div>
            <div className="story-visual" style={{ backgroundImage: `url(${realityImage})` }} data-animate="fade-left">
              <div className="scribble">
                Let Jobiest handle
                <br />
                the busy work... <ArrowRight size={23} />
              </div>
              <div className="task-stack">
                <div data-animate="slide-in">Find relevant roles</div>
                <div data-animate="slide-in">Tailor your CV</div>
                <div data-animate="slide-in">Write your letter</div>
                <div data-animate="slide-in">Complete the form</div>
                <div data-animate="slide-in">Prepare to submit</div>
              </div>
            </div>
          </div>
        </section>

        <section className="story-section truth" data-animate="fade-up">
          <div className="container split-layout reverse">
            <div className="story-copy">
              <span className="kicker">The hard truth</span>
              <h2>
                It is not a talent problem.
                <br />
                It is a translation problem.
              </h2>
              <p>
                You know what you can do. But hiring platforms are crowded, forms make you repeat your story 10 times, and rushed applications
                bury your best work. High performers do not lose because they lack skill. They lose because their experience does not get
                translated for each role.
              </p>
              <p className="muted">
                Your experience deserves a fair shot. Jobiest puts it into words for each job — without inventing credentials, without taking
                the decision from you. Truthful. Specific. Yours.
              </p>
              <a className="text-link" href="#how-it-works">
                Put your experience in the right places <ArrowRight size={15} />
              </a>
            </div>
            <div className="laptop-visual" data-animate="scale-in">
              <div className="laptop">
                <div className="screen">
                  <div className="screen-bar" />
                  <div className="screen-lines">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="laptop-base" />
              </div>
              <div className="ats-card" data-animate="fade-up">
                <span className="check-bubble">
                  <Check size={14} />
                </span>
                <strong>ATS Optimised</strong>
                <p>
                  <Check size={12} /> Keywords matched
                </p>
                <p>
                  <Check size={12} /> Skills aligned
                </p>
                <p>
                  <Check size={12} /> Formatting ready
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="story-section how" id="how-it-works" data-animate="fade-up">
          <div className="container split-layout">
            <div className="story-copy">
              <span className="kicker">How it works — your unfair advantage</span>
              <h2>Your job search, handled. You stay in control.</h2>
              <p>
                You set the direction. Jobiest does the heavy lifting. You make the final call on everything that gets sent. That is how pros
                play this game.
              </p>
              <ul className="check-list compact">
                <li data-animate="fade-up">
                  <span>
                    <Check size={12} />
                  </span>
                  Find the right doors — roles that actually fit your experience and goals, not random noise.
                </li>
                <li data-animate="fade-up">
                  <span>
                    <Check size={12} />
                  </span>
                  Position yourself right — a truthful, tailored CV and cover letter for each role, built from your real work.
                </li>
                <li data-animate="fade-up">
                  <span>
                    <Check size={12} />
                  </span>
                  You approve or edit — nothing is submitted until you say yes. Flagged claims are surfaced for review.
                </li>
                <li data-animate="fade-up">
                  <span>
                    <Check size={12} />
                  </span>
                  Track and follow through — spend your saved hours preparing to win the interview, not refilling forms.
                </li>
              </ul>
              <Button>Start for free</Button>
            </div>
            <div className="story-visual how-visual" style={{ backgroundImage: `url(${howImage})` }} data-animate="fade-left">
              <div className="scribble dark-scribble">
                Less effort.
                <br />
                More opportunities.
                <ArrowRight size={23} />
              </div>
              <div className="floating-notification" data-animate="slide-in">
                <span className="check-bubble">
                  <Check size={13} />
                </span>
                <div>
                  <strong>Application submitted!</strong>
                  <small>Only after your approval</small>
                </div>
                <ChevronRight size={16} />
              </div>
            </div>
          </div>
        </section>

        <section className="steps-section" id="steps" data-animate="fade-up">
          <div className="container">
            <div className="section-intro" data-animate="fade-up">
              <span className="kicker">Three simple steps</span>
              <h2>Three steps. Fifteen minutes. Then it runs for you.</h2>
              <p>
                Amateurs make job hunting complicated. Pros make it systematic. Tell us what you want. We handle the repetitive parts. You keep
                the decision.
              </p>
            </div>
            <div className="steps-grid" data-animate="stagger">
              <div data-animate="fade-up">
                <StepCard number="1" icon={<BriefcaseBusiness size={20} />} title="Declare your next move">
                  Tell us what you have done, what you are great at, and what your next chapter looks like. Clarity first.
                </StepCard>
              </div>
              <div data-animate="fade-up">
                <StepCard number="2" icon={<Sparkles size={20} />} title="We position you" tag="Takes ~15 minutes">
                  Jobiest finds fitting roles and builds a truthful, tailored application for each. You inspect every word before it is ready.
                </StepCard>
              </div>
              <div data-animate="fade-up">
                <StepCard number="3" icon={<Search size={20} />} title="You call the shots">
                  Approve only what feels right. Track every submission. Use the hours you saved to prepare like a closer.
                </StepCard>
              </div>
            </div>
          </div>
        </section>

        <section className="pricing-section" id="pricing" data-animate="fade-up">
          <div className="container pricing-wrap">
            <div className="pricing-copy">
              <span className="kicker">Pricing — invest, do not expense</span>
              <h2>Start free. Upgrade when you feel the lift.</h2>
              <p>
                This is not a cost. It is leverage. Choose the level that matches your ambition. Cancel anytime — your next move stays yours.
              </p>
              <div className="pricing-grid">
                {plans.map((plan, idx) => (
                  <div
                    className={plan.popular ? "price-card popular" : "price-card"}
                    key={plan.name}
                    data-animate="fade-up"
                    style={{ transitionDelay: `${idx * 90}ms` }}
                  >
                    {plan.popular && <span className="popular-tag">Most popular</span>}
                    <div className="plan-name">{plan.name}</div>
                    <div className="price">
                      {plan.price}
                      <small> / month</small>
                    </div>
                    <div className="price-rule" />
                    {plan.features.map((feature) => (
                      <div className="plan-feature" key={feature}>
                        <Check size={13} />
                        {feature}
                      </div>
                    ))}
                    <a href="/signup" className="plan-button">
                      Get started <ArrowRight size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
            <div className="pricing-image" style={{ backgroundImage: `url(${pricingImage})` }} data-animate="fade-left">
              <div className="image-note">
                Invest in
                <br />
                your future <span>♡</span>
              </div>
            </div>
          </div>
        </section>

        <section className="bottom-cta" data-animate="fade-up">
          <div className="container cta-inner" data-animate="scale-in">
            <div className="cta-thumb" style={{ backgroundImage: `url(${heroImage})` }} />
            <div>
              <span className="kicker kicker-light">Ready to play at a higher level?</span>
              <h2>The job you want is still open.</h2>
              <p>Stop leaving it to chance. Let Jobiest handle the busywork — with your approval at every step — so you can show up ready to win.</p>
            </div>
            <Button>Create free account</Button>
            <a className="button button-ghost" href="#steps">
              See how it works
            </a>
          </div>
        </section>
      </main>

      <footer id="footer" data-animate="fade-up">
        <div className="container footer-top">
          <div className="footer-brand">
            <FooterLogo />
            <p>Your AI career agent. Truthful. On-demand. Yours.</p>
            <span>You're in control.</span>
          </div>
          <div className="footer-links">
            <div>
              <strong>Explore</strong>
              <a href="#how-it-works">How it works</a>
              <a href="#steps">Free tools</a>
              <a href="#pricing">Pricing</a>
              <a href="#footer">Blog</a>
            </div>
            <div>
              <strong>Help</strong>
              <a href="#footer">Support</a>
              <a href="#footer">Email support</a>
              <a href="#footer">Terms & privacy</a>
            </div>
          </div>
          <div className="socials">
            <a href="#footer" aria-label="Twitter">
              <span>X</span>
            </a>
            <a href="#footer" aria-label="LinkedIn">
              <span>in</span>
            </a>
            <a href="#footer" aria-label="Instagram">
              <span>IG</span>
            </a>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© 2025 Jobiest. Nothing is submitted without your approval.</span>
          <span>
            Better jobs.
            <br />
            <em>Brighter futures.</em> <Sparkles size={14} />
          </span>
        </div>
      </footer>
    </div>
  );
}
