"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase-browser";
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

const heroImage = "/assets/images/hero-job-search.webp";
const realityImage = "/assets/images/reality-woman-laptop.webp";
const howImage = "/assets/images/how-it-works-man-phone.webp";
const pricingImage = "/assets/images/pricing-woman-laptop.webp";

const plans = [
  { name: "Basic", price: "₦5,000", features: ["3 tailored CVs or letters per day", "2 Agent Mode trial runs included", "50 career-tool uses per day"] },
  { name: "Premium", price: "₦10,000", popular: true, features: ["10 tailored CVs or letters per day", "Daily job discovery on employer boards", "Up to 10 Agent Mode applications/day", "Unlimited career tools & priority support"] },
  { name: "Max", price: "₦20,000", features: ["20 tailored CVs or letters per day", "Up to 20 Agent Mode applications/day", "Highest monthly document & apply caps", "Dedicated concierge support"] },
];

const problemChecks = [
  "Keeping a dozen job tabs open until strong roles close.",
  "Rewriting the same CV bullets for every job description.",
  "Drafting another cover letter from scratch late at night.",
  "Retyping your work history into employer portals again.",
  "Losing track of which CV version went to which company.",
];

const workflowSteps = [
  { title: "Bring or match a role", icon: <Search size={17} />, detail: "Paste any job link or browse matched employer roles." },
  { title: "Tailor your CV", icon: <FileText size={17} />, detail: "Highlights the real experience each role asks for." },
  { title: "Draft your cover letter", icon: <Sparkles size={17} />, detail: "Specific to the company, written in plain English." },
  { title: "Prepare form answers", icon: <BriefcaseBusiness size={17} />, detail: "Pauses salary, visa, and legal questions for you." },
  { title: "Wait for your yes", icon: <ShieldCheck size={17} />, detail: "Export PDF/DOCX or approve submission in one click." },
];

const howSteps = [
  ["Set up your profile once", "Upload your existing PDF CV or enter your roles, skills, and achievements. Everything stays editable."],
  ["Paste a job link or browse matches", "Bring any job posting URL on any plan, or receive daily matches from supported employer boards on Premium and Max."],
  ["Inspect your tailored CV & letter", "Switch across 30 clean CV templates, edit any line, and answer sensitive questions like salary or work authorisation yourself."],
  ["Approve, export, or track", "Download PDF or DOCX to apply directly, or approve Agent Mode submissions on supported career pages and track replies."],
];

function Logo() {
  return <a href="#top" className="brand" aria-label="Jobiest home"><img className="header-logo-image" src="/assets/logos/jobiest-header-logo.png" alt="Jobiest" /></a>;
}

function FooterLogo() {
  return <a href="#top" className="footer-logo-image" aria-label="Jobiest home"><img src="/assets/logos/jobiest-footer-logo.png" alt="Jobiest" /></a>;
}

function Button({ children, href = "#pricing", secondary = false }: { children: React.ReactNode; href?: string; secondary?: boolean }) {
  const reduce = useReducedMotion();
  // Motion.dev Gestures - https://motion.dev/docs/react-gestures (whileHover/whileTap)
  return <motion.a className={secondary ? "button button-secondary" : "button"} href={href} whileHover={reduce ? {} : { scale: 1.02 }} whileTap={reduce ? {} : { scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>{children}<ArrowRight size={15} strokeWidth={2.5} /></motion.a>;
}

function Reveal({ children, className = "", delay = 0, direction = "up" }: { children: React.ReactNode; className?: string; delay?: number; direction?: "up" | "left" | "right" }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const inView = useInView(elementRef, { once: true, amount: 0.2 });
  const reduce = useReducedMotion();
  const initial = reduce ? { opacity: 1 } : direction === "left" ? { opacity: 0, x: -28 } : direction === "right" ? { opacity: 0, x: 28 } : { opacity: 0, y: 28 };
  const animate = reduce ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 };
  return <motion.div ref={elementRef} className={className} initial={initial} animate={inView ? animate : initial} transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : delay, ease: "easeOut" }}>{children}</motion.div>;
}

function ApprovalCard() {
  const reduce = useReducedMotion();
  return <motion.div className="approval-card" initial={reduce ? { opacity: 1 } : { opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: reduce ? 0 : 2.1, duration: reduce ? 0 : .72, ease: [0.22, 1, 0.36, 1] }}>
    <div className="approval-head"><div><span className="eyebrow">Application Package</span><strong>Senior Frontend Developer</strong></div><span className="status status-lime">Ready for your review</span></div>
    <div className="approval-rule"><Check size={13} /><span>CV tailored to role requirements</span><b>View</b></div>
    <div className="approval-rule"><Check size={13} /><span>Core skills verified from profile</span><b>Matched</b></div>
    <div className="approval-rule warn"><Sparkles size={13} /><span>Unverified skill left out</span><b>Checked</b></div>
    <div className="approval-rule"><FileText size={13} /><span>Role-specific CV <small>PDF & DOCX ready</small></span><b>Ready</b></div>
    <div className="approval-rule"><FileText size={13} /><span>Cover letter <small>Built from your real work</small></span><b>Ready</b></div>
    <button className="approval-action">Review & approve <ArrowRight size={14} /></button>
  </motion.div>;
}

function WorkflowDemo() {
  const reduce = useReducedMotion();
  return <div className="workflow-panel" aria-label="Jobiest application preparation workflow">
    <div className="workflow-topline"><span>Jobiest workspace</span><span className="status status-lime">Package ready to review</span></div>
    <div className="workflow-steps">{workflowSteps.map((step, index) => <motion.div className="workflow-step" key={step.title} initial={reduce ? { opacity: 1 } : { opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .4 }} transition={{ delay: reduce ? 0 : index * .1, duration: .45 }}><span className="workflow-icon">{step.icon}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div>{index < workflowSteps.length - 1 && <ChevronRight size={15} className="workflow-arrow" />}</motion.div>)}</div>
    <div className="workflow-footer"><span><Check size={14} /> Built strictly from your profile facts.</span><span className="mini-tag">Approval first</span></div>
  </div>;
}

function StepCard({ number, icon, title, children, tag }: { number: string; icon: React.ReactNode; title: string; children: React.ReactNode; tag?: string }) {
  return <div className="step-card"><div className="step-number">{number}</div><div className="step-icon">{icon}</div><h3>{title}</h3><p>{children}</p>{tag && <span className="mini-tag">{tag}</span>}</div>;
}

function Hero() {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(reduce ? "Finally..." : "");
  const [ready, setReady] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const word = "Finally...";
    const timers = Array.from({ length: word.length }, (_, index) => window.setTimeout(() => setTyped(word.slice(0, index + 1)), 90 * (index + 1)));
    const done = window.setTimeout(() => setReady(true), 1050);
    return () => { timers.forEach(window.clearTimeout); window.clearTimeout(done); };
  }, [reduce]);
  return <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(3,17,28,.96) 0%, rgba(3,17,28,.82) 36%, rgba(3,17,28,.16) 74%), url(${heroImage})` }}>
    <div className="container hero-content"><div className="hero-copy">
      <div className="typing-label" aria-live="polite"><span aria-hidden="true">{typed || "Finally..."}</span><span className="sr-only">Finally...</span></div>
      <motion.h1 initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration: .65 }}>{"Apply to the right jobs without spending your evenings rewriting CVs and refilling the same forms."}</motion.h1>
      <motion.p initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }} transition={{ delay: .18, duration: .6 }}>Build your career profile once. Paste any job link, or review matched openings, and Jobiest prepares a truthful, role-specific application for your approval.</motion.p>
      <motion.div className="hero-actions" initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }} transition={{ delay: .32, duration: .55 }}><Button href="/signup">Start for free</Button><a href="#how-it-works" className="button button-ghost"><CirclePlay size={16} /> See how it works</a></motion.div>
      <div className="hero-note"><ShieldCheck size={14} /> Nothing is ever sent without your approval.</div>
    </div><ApprovalCard /></div><div className="hero-dots">•••••</div>
  </section>;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Handle OAuth errors redirected to site root (flow_state_already_used etc)
  // Supabase redirects to NEXT_PUBLIC_APP_URL on PKCE errors - we handle client-side
  // since middleware is not allowed to run on '/' per homepage routing contract
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('code')) {
      window.location.replace(`/auth/callback${window.location.search}`);
      return;
    }
    const errorCode = params.get('error_code');
    const error = params.get('error');
    if (errorCode === 'flow_state_already_used' || error === 'invalid_request' || error) {
      supabaseBrowser().auth.getSession().then(({ data }) => {
        if (data?.session) {
          window.location.href = '/auth/callback';
        } else {
          window.location.href = `/login?error=${error === 'access_denied' ? 'oauth_cancelled' : 'oauth_retry'}`;
        }
      }).catch(() => {
        window.location.href = '/login?error=oauth_retry';
      });
    }
  }, []);
  return <div className="site-shell" id="top">
    <header className="site-header"><div className="nav-wrap"><Logo />
      {/* Desktop nav - CSS handles visibility, no motion needed */}
      <nav className="nav-links desktop-only" aria-label="Primary"><a href="#how-it-works">How it works</a><a href="/tools">Free tools</a><a href="#pricing">Pricing</a><a href="/blog">Blog</a><a href="/about">About</a></nav>
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            className="nav-links open mobile-only"
            aria-label="Primary"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="/tools" onClick={() => setMenuOpen(false)}>Free tools</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <a href="/blog" onClick={() => setMenuOpen(false)}>Blog</a>
            <a href="/about" onClick={() => setMenuOpen(false)}>About</a>
          </motion.nav>
        )}
      </AnimatePresence>
      <div className="nav-actions"><a className="login-link" href="/login">Log in</a><Button href="/signup">Get started free</Button></div><button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div></header>
    <main>
      <Hero />

      <section className="story-section reality"><div className="container split-layout"><Reveal className="story-copy" direction="left"><span className="kicker">Why job hunting drains you</span><h2>Qualified people lose hours to repetitive admin work.</h2><p>Looking for your next role already takes focus. Every evening should not disappear into formatting and form fields.</p><ul className="check-list">{problemChecks.map((item, index) => <motion.li key={item} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * .08 }}><span><Check size={12} /></span>{item}</motion.li>)}</ul><p className="muted">Jobiest takes the repetitive preparation off your plate so you can spend your energy on roles worth pursuing and interviews worth winning.</p></Reveal><Reveal className="story-visual" direction="right"><div style={{ backgroundImage: `url(${realityImage})`, position: "absolute", inset: 0, backgroundSize: "cover", backgroundPosition: "center" }} /><div className="scribble">Spend less time<br />on busywork <ArrowRight size={23} /></div><div className="task-stack"><div>12 job tabs open</div><div>Rewrite CV again</div><div>Retype work history</div><div>Start over tomorrow</div></div></Reveal></div></section>

      <section className="story-section reality-editorial"><div className="container editorial-grid"><Reveal className="editorial-copy" direction="left"><span className="kicker">Built for real life</span><h2>You do not lack effort.<br /><span>You lack spare hours.</span></h2><p>Between a full day of work, family commitments, and everyday life, most job seekers only get a tired hour after dinner to move their career forward.</p><p>You bookmark a great opening at noon, plan to tailor your CV tonight, and watch six days slip by before you can sit down to write.</p><p>When every single application demands forty minutes of manual editing and portal entry, staying consistent feels like a second job.</p></Reveal><Reveal className="editorial-visual" direction="right"><div className="editorial-quote">Built for<br /><strong>your real<br />schedule.</strong></div><div className="editorial-photo" style={{ backgroundImage: `url(${realityImage})` }} /></Reveal></div><div className="container editorial-bottom"><p>Searching on your commute or late at night should not mean choosing between rushing out a generic CV or letting a strong opportunity pass you by.</p><p><strong>Where Jobiest fits in:</strong> you bring your real experience once, and Jobiest prepares clear, role-specific drafts in minutes so your evenings stay yours.</p></div></section>

      <section className="story-section solution" id="solution"><div className="container split-layout"><Reveal className="story-copy" direction="left"><span className="kicker">One calm workflow</span><h2>From job link to tailored package in minutes.</h2><p>Paste any job posting or review matched openings on eligible plans. Every document is drafted from your verified profile and held for your sign-off.</p><Button href="#how-it-works">See how it works</Button></Reveal><Reveal className="workflow-demo" direction="right"><WorkflowDemo /></Reveal></div></section>

      <section className="story-section truth"><div className="container split-layout reverse"><Reveal className="story-copy" direction="left"><span className="kicker">Truthful by design</span><h2>Tailored to each role. Honest to every word.</h2><p>Generic CVs get overlooked because recruiters scan for clear relevance in seconds. At the same time, tools that invent skills or exaggerate titles put your reputation at risk.</p><p>Jobiest bridges that gap safely: it highlights your genuine achievements for each job description while blocking unsupported employers, schools, or credentials before you save.</p><a className="text-link" href="#how-it-works">See how approval works <ArrowRight size={15} /></a></Reveal><Reveal className="laptop-visual" direction="right"><div className="laptop"><div className="screen"><div className="screen-bar" /><div className="screen-lines"><i /><i /><i /><i /><i /></div></div><div className="laptop-base" /></div><div className="ats-card"><span className="check-bubble"><Check size={14} /></span><strong>Verified & ATS-Ready</strong><p><Check size={12} /> Role keywords aligned</p><p><Check size={12} /> Only verified facts used</p><p><Check size={12} /> Clean PDF & DOCX export</p></div></Reveal></div></section>

      <section className="story-section how" id="how-it-works"><div className="container split-layout"><Reveal className="story-copy" direction="left"><span className="kicker">How it works</span><h2>What happens after you create your free account.</h2><p>No complicated setup and no inbox access required. You set your preferences once, review every tailored draft, and decide what goes out.</p><div className="process-timeline">{howSteps.map(([title, body], index) => <motion.div className="process-item" key={title} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * .08 }}><span>{index + 1}</span><div><strong>{title}</strong><p>{body}</p></div></motion.div>)}</div><Button href="/signup">Start for free</Button></Reveal><Reveal className="story-visual how-visual" direction="right"><div style={{ position: "absolute", inset: 0, backgroundImage: `url(${howImage})`, backgroundSize: "cover", backgroundPosition: "center" }} /><div className="scribble dark-scribble">Your experience.<br />Clearly presented. <ArrowRight size={23} /></div><div className="floating-notification"><span className="check-bubble"><Check size={13} /></span><div><strong>Tailored package ready</strong><small>Waiting for your approval</small></div><ChevronRight size={16} /></div></Reveal></div></section>

      <section className="steps-section" id="steps"><div className="container"><Reveal className="section-intro"><span className="kicker">Quick start</span><h2>Up and running in about ten minutes.</h2><p>Whether you are actively applying every week or selectively exploring stronger roles, your workspace adapts to how you prefer to apply.</p></Reveal><motion.div className="steps-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}><motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.4 }}><StepCard number="1" icon={<BriefcaseBusiness size={20} />} title="One master career profile">Keep your work history, measurable results, education, and projects in one structured place instead of scattered CV files.</StepCard></motion.div><motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.4 }}><StepCard number="2" icon={<Sparkles size={20} />} title="Role-specific drafts on demand" tag="3 free drafts included">Paste a job description whenever a role catches your eye and get a tailored CV and cover letter grounded in your facts.</StepCard></motion.div><motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.4 }}><StepCard number="3" icon={<Search size={20} />} title="Full control over every send">Keep manual approval on by default, or opt in to automatic submission on eligible plans with email confirmation after each send.</StepCard></motion.div></motion.div></div></section>

      <section className="pricing-section" id="pricing"><div className="container pricing-wrap"><Reveal className="pricing-copy" direction="left"><span className="kicker">Simple monthly plans</span><h2>Start free. Upgrade when you want higher daily volume.</h2><p>Every new account includes 3 free tailored document generations and 10 free career-tool uses per day. Upgrade anytime for daily tailoring and Agent Mode runs, and cancel whenever you like.</p><motion.div className="pricing-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}>{plans.map((plan) => <motion.div key={plan.name} variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } }}><div className={plan.popular ? "price-card popular" : "price-card"}>{plan.popular && <span className="popular-tag">Most popular</span>}<div className="plan-name">{plan.name}</div><div className="price">{plan.price}<small> / month</small></div><div className="price-rule" />{plan.features.map((feature) => <div className="plan-feature" key={feature}><Check size={13} />{feature}</div>)}<motion.a href="/signup" className="plan-button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>Get started <ArrowRight size={14} /></motion.a></div></motion.div>)}</motion.div></Reveal><Reveal className="pricing-image" direction="right"><div style={{ position: "absolute", inset: 0, backgroundImage: `url(${pricingImage})`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: "inherit" }} /><div className="image-note">Built around<br />your goals <span>✦</span></div></Reveal></div></section>

      <section className="bottom-cta"><div className="container cta-inner"><div className="cta-thumb" style={{ backgroundImage: `url(${heroImage})` }} /><Reveal><span className="kicker kicker-light">Start with one role</span><h2>Bring the next job link on your list.</h2><p>Create your free account in a minute, upload your current CV, and preview a truthful, role-specific application before anything is sent.</p></Reveal><Button href="/signup">Create free account</Button><a className="button button-ghost" href="#how-it-works">See how it works</a></div></section>
    </main>
    <footer id="footer"><div className="container footer-top"><div className="footer-brand"><FooterLogo /><p>Tailored CVs, cover letters, and controlled job applications built from your real experience.</p><span>Nothing sends without your permission.</span></div><div className="footer-links"><div><strong>Explore</strong><a href="#how-it-works">How it works</a><a href="/tools">Free tools</a><a href="/templates">CV templates</a><a href="#pricing">Pricing</a><a href="/blog">Blog</a></div><div><strong>Help</strong><a href="/support">Support</a><a href="mailto:support@jobiest.com">Email support</a><a href="/terms">Terms & privacy</a></div></div><div className="socials"><a href="#top" aria-label="X"><span>X</span></a><a href="#top" aria-label="LinkedIn"><span>in</span></a><a href="#top" aria-label="Instagram"><span>IG</span></a></div></div><div className="container footer-bottom"><span>© 2026 Jobiest. Jobiest never charges candidates to apply, and nothing is sent without your approval.</span><span>Less busywork.<br /><em>Stronger applications.</em> <Sparkles size={14} /></span></div></footer>
  </div>;
}
