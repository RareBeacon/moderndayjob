"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
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
  { name: "Basic", price: "₦5,000", features: ["Up to 10 applications per month", "AI-tailored CV & cover letter", "Job tracking & notifications"] },
  { name: "Premium", price: "₦10,000", popular: true, features: ["Up to 30 applications per month", "Advanced AI tailoring", "Priority support", "Full application tracking"] },
  { name: "Max", price: "₦20,000", features: ["Unlimited applications", "Premium AI assistance", "Dedicated support", "Advanced application tracking"] },
];

const problemChecks = [
  "You wake up in the morning.",
  "You spend hours looking for relevant job opportunities.",
  "You create different tailored resumes for each job.",
  "You fill out different forms over and over again.",
  "You keep relying on hope.",
];

const workflowSteps = [
  { title: "Find relevant roles", icon: <Search size={17} />, detail: "Relevant opportunities, not random noise." },
  { title: "Tailor your CV", icon: <FileText size={17} />, detail: "Truthful language built from your real work." },
  { title: "Write your letter", icon: <Sparkles size={17} />, detail: "A clear reason you fit this role." },
  { title: "Complete the form", icon: <BriefcaseBusiness size={17} />, detail: "Less retyping. Fewer repeated fields." },
  { title: "Prepare to submit", icon: <ShieldCheck size={17} />, detail: "Nothing goes anywhere without your yes." },
];

const howSteps = [
  ["Find the right doors", "Find roles that actually fit your experience and goals, not random noise."],
  ["Position yourself right", "Prepare a truthful, tailored CV and cover letter for each role, built from your real work."],
  ["You approve or edit", "Nothing is submitted until you say yes. Flagged claims are surfaced for review."],
  ["Track and follow through", "Spend your saved hours preparing to win the interview, not refilling forms."],
];

function Logo() {
  return <a href="#top" className="brand" aria-label="Jobiest home"><img className="header-logo-image" src="/assets/logos/jobiest-header-logo.png" alt="Jobiest" /></a>;
}

function FooterLogo() {
  return <a href="#top" className="footer-logo-image" aria-label="Jobiest home"><img src="/assets/logos/jobiest-footer-logo.png" alt="Jobiest" /></a>;
}

function Button({ children, href = "#pricing", secondary = false }: { children: React.ReactNode; href?: string; secondary?: boolean }) {
  return <a className={secondary ? "button button-secondary" : "button"} href={href}>{children}<ArrowRight size={15} strokeWidth={2.5} /></a>;
}

function Reveal({ children, className = "", delay = 0, direction = "up" }: { children: React.ReactNode; className?: string; delay?: number; direction?: "up" | "left" | "right" }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const inView = useInView(elementRef, { once: true, amount: 0.18 });
  const reduce = useReducedMotion();
  const initial = reduce ? { opacity: 1 } : direction === "left" ? { opacity: 0, x: -28 } : direction === "right" ? { opacity: 0, x: 28 } : { opacity: 0, y: 28 };
  const animate = reduce ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 };
  return <motion.div ref={elementRef} className={className} initial={initial} animate={inView ? animate : initial} transition={{ duration: reduce ? 0 : 0.68, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function ApprovalCard() {
  const reduce = useReducedMotion();
  return <motion.div className="approval-card" initial={reduce ? { opacity: 1 } : { opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: reduce ? 0 : 2.1, duration: reduce ? 0 : .72, ease: [0.22, 1, 0.36, 1] }}>
    <div className="approval-head"><div><span className="eyebrow">Job Application Review</span><strong>Senior Frontend Developer</strong></div><span className="status status-lime">Needs your approval</span></div>
    <div className="approval-rule"><Check size={13} /><span>CV tailored to this role</span><b>View</b></div>
    <div className="approval-rule"><Check size={13} /><span>Matches required skills</span><b>Verified</b></div>
    <div className="approval-rule warn"><Sparkles size={13} /><span>Flagged unsupported claim</span><b>Review</b></div>
    <div className="approval-rule"><FileText size={13} /><span>CV <small>Tailored for this role</small></span><b>Ready</b></div>
    <div className="approval-rule"><FileText size={13} /><span>Cover letter <small>AI generated and personalised</small></span><b>Ready</b></div>
    <button className="approval-action">Review & approve <ArrowRight size={14} /></button>
  </motion.div>;
}

function WorkflowDemo() {
  const reduce = useReducedMotion();
  return <div className="workflow-panel" aria-label="Jobiest application preparation workflow">
    <div className="workflow-topline"><span>Jobiest workspace</span><span className="status status-lime">Draft ready for review</span></div>
    <div className="workflow-steps">{workflowSteps.map((step, index) => <motion.div className="workflow-step" key={step.title} initial={reduce ? { opacity: 1 } : { opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .4 }} transition={{ delay: reduce ? 0 : index * .1, duration: .45 }}><span className="workflow-icon">{step.icon}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div>{index < workflowSteps.length - 1 && <ChevronRight size={15} className="workflow-arrow" />}</motion.div>)}</div>
    <div className="workflow-footer"><span><Check size={14} /> You choose what gets sent.</span><span className="mini-tag">Review first</span></div>
  </div>;
}

function StepCard({ number, icon, title, children, tag }: { number: string; icon: React.ReactNode; title: string; children: React.ReactNode; tag?: string }) {
  return <div className="step-card"><div className="step-number">{number}</div><div className="step-icon">{icon}</div><h3>{title}</h3><p>{children}</p>{tag && <span className="mini-tag">{tag}</span>}</div>;
}

function Hero() {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(reduce ? "Hurray..." : "");
  const [ready, setReady] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const word = "Hurray...";
    const timers = Array.from({ length: word.length }, (_, index) => window.setTimeout(() => setTyped(word.slice(0, index + 1)), 90 * (index + 1)));
    const done = window.setTimeout(() => setReady(true), 1050);
    return () => { timers.forEach(window.clearTimeout); window.clearTimeout(done); };
  }, [reduce]);
  return <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(3,17,28,.96) 0%, rgba(3,17,28,.82) 36%, rgba(3,17,28,.16) 74%), url(${heroImage})` }}>
    <div className="container hero-content"><div className="hero-copy">
      <div className="typing-label" aria-live="polite"><span aria-hidden="true">{typed || "Hurray..."}</span><span className="sr-only">Hurray...</span></div>
      <motion.h1 initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration: .65 }}>{"You can now search and apply for jobs without spending hours searching the internet, creating tailored CVs, and filling out the same forms over and over again."}</motion.h1>
      <motion.p initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }} transition={{ delay: .18, duration: .6 }}>Jobiest is designed to take the busywork off your shoulders, so you can focus on landing the job you deserve.</motion.p>
      <motion.div className="hero-actions" initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }} transition={{ delay: .32, duration: .55 }}><Button>Start for free</Button><a href="#how-it-works" className="button button-ghost"><CirclePlay size={16} /> See how it works</a></motion.div>
      <div className="hero-note"><ShieldCheck size={14} /> You approve every application before it goes anywhere.</div>
    </div><ApprovalCard /></div><div className="hero-dots">•••••</div>
  </section>;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="site-shell" id="top">
    <header className="site-header"><div className="nav-wrap"><Logo /><nav className={menuOpen ? "nav-links open" : "nav-links"}><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#steps" onClick={() => setMenuOpen(false)}>Free tools</a><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a><a href="#footer" onClick={() => setMenuOpen(false)}>Blog</a><a href="#footer" onClick={() => setMenuOpen(false)}>About</a></nav><div className="nav-actions"><a className="login-link" href="#footer">Log in</a><Button href="#pricing">Get started free</Button></div><button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div></header>
    <main>
      <Hero />

      <section className="story-section reality"><div className="container split-layout"><Reveal className="story-copy" direction="left"><span className="kicker">The problem</span><h2>We all know how time-demanding job hunting can be...</h2><p>We all know how exhausting these activities can be.</p><ul className="check-list">{problemChecks.map((item, index) => <motion.li key={item} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * .08 }}><span><Check size={12} /></span>{item}</motion.li>)}</ul><p className="muted">That's why Jobiest is designed to relieve you of the stress. Jobiest is here to help you apply for more jobs by working less and getting more interviews.</p></Reveal><Reveal className="story-visual" direction="right"><div style={{ backgroundImage: `url(${realityImage})`, position: "absolute", inset: 0, backgroundSize: "cover", backgroundPosition: "center" }} /><div className="scribble">Let Jobiest handle<br />the busy work... <ArrowRight size={23} /></div><div className="task-stack"><div>Job tabs open</div><div>Tailor your CV</div><div>Repeat the form</div><div>Try again</div></div></Reveal></div></section>

      <section className="story-section reality-editorial"><div className="container editorial-grid"><Reveal className="editorial-copy" direction="left"><span className="kicker">The reality — listen up</span><h2>You are not lazy.<br /><span>You are maxed out.</span></h2><p>You give 100% at work. You show up for family. You pay the bills. Then, in the cracks between dinner and sleep, you are supposed to launch a second full-time job called job hunting. Of course you are exhausted. That is not a you problem. That is a system problem.</p><p>You saved that perfect role at lunch. You swore you'd apply tonight. Life happened. The tab is still open 6 days later.</p><p>You've rewritten the same CV 5 times to sound like the person you already are. It shouldn't be this hard.</p></Reveal><Reveal className="editorial-visual" direction="right"><div className="editorial-quote">That is<br /><strong>a system<br />problem.</strong></div><div className="editorial-photo" style={{ backgroundImage: `url(${realityImage})` }} /></Reveal></div><div className="container editorial-bottom"><p>You retype your entire work history into another form, field by field, praying this one lands. You job hunt on the bus, after dinner, in the stolen minutes that were meant for you. And when silence hits, starting the next one costs you a little more. That's not weakness. That's a broken process.</p><p><strong>Here is what winners understand:</strong> a slow reply does not mean you are not good enough. It means your value was not positioned right. Jobiest handles the repetitive positioning work so you can save your energy for the conversations that actually move your life forward.</p></div></section>

      <section className="story-section solution" id="solution"><div className="container split-layout"><Reveal className="story-copy" direction="left"><span className="kicker">The solution</span><h2>Let Jobiest handle the busywork...</h2><p>From finding a relevant role to preparing an application for your review, each step leads naturally into the next.</p><Button href="#how-it-works">See the workflow</Button></Reveal><Reveal className="workflow-demo" direction="right"><WorkflowDemo /></Reveal></div></section>

      <section className="story-section truth"><div className="container split-layout reverse"><Reveal className="story-copy" direction="left"><span className="kicker">The hard truth</span><h2>It is not a talent problem. It is a translation problem.</h2><p>You know what you can do. But hiring platforms are crowded, forms make you repeat your story 10 times, and rushed applications bury your best work. High performers do not lose because they lack skill. They lose because their experience does not get translated for each role.</p><p>Your experience deserves a fair shot. Jobiest puts it into words for each job — without inventing credentials, without taking the decision from you. Truthful. Specific. Yours.</p><a className="text-link" href="#how-it-works">Put your experience in the right places <ArrowRight size={15} /></a></Reveal><Reveal className="laptop-visual" direction="right"><div className="laptop"><div className="screen"><div className="screen-bar" /><div className="screen-lines"><i /><i /><i /><i /><i /></div></div><div className="laptop-base" /></div><div className="ats-card"><span className="check-bubble"><Check size={14} /></span><strong>ATS Optimised</strong><p><Check size={12} /> Keywords matched</p><p><Check size={12} /> Skills aligned</p><p><Check size={12} /> Formatting ready</p></div></Reveal></div></section>

      <section className="story-section how" id="how-it-works"><div className="container split-layout"><Reveal className="story-copy" direction="left"><span className="kicker">How it works</span><h2>Your job search, handled. You stay in control.</h2><p>You set the direction. Jobiest does the heavy lifting. You make the final call on everything that gets sent. That is how pros play this game.</p><div className="process-timeline">{howSteps.map(([title, body], index) => <motion.div className="process-item" key={title} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * .08 }}><span>{index + 1}</span><div><strong>{title}</strong><p>{body}</p></div></motion.div>)}</div><Button>Start for free</Button></Reveal><Reveal className="story-visual how-visual" direction="right"><div style={{ position: "absolute", inset: 0, backgroundImage: `url(${howImage})`, backgroundSize: "cover", backgroundPosition: "center" }} /><div className="scribble dark-scribble">Less effort.<br />More opportunities.<ArrowRight size={23} /></div><div className="floating-notification"><span className="check-bubble"><Check size={13} /></span><div><strong>Application ready for review</strong><small>Only after your approval</small></div><ChevronRight size={16} /></div></Reveal></div></section>

      <section className="steps-section" id="steps"><div className="container"><Reveal className="section-intro"><span className="kicker">Three simple steps</span><h2>Three steps. Fifteen minutes. Then it runs for you.</h2><p>Amateurs make job hunting complicated. Pros make it systematic. Tell us what you want. We handle the repetitive parts. You keep the decision.</p></Reveal><div className="steps-grid"><Reveal delay={.05}><StepCard number="1" icon={<BriefcaseBusiness size={20} />} title="Declare your next move">Tell us what you have done, what you are great at, and what your next chapter looks like. Clarity first.</StepCard></Reveal><Reveal delay={.12}><StepCard number="2" icon={<Sparkles size={20} />} title="We position you" tag="Takes ~15 minutes">Jobiest finds fitting roles and builds a truthful, tailored application for each. You inspect every word before it is ready.</StepCard></Reveal><Reveal delay={.19}><StepCard number="3" icon={<Search size={20} />} title="You call the shots">Approve only what feels right. Track every submission. Use the hours you saved to prepare like a closer.</StepCard></Reveal></div></div></section>

      <section className="pricing-section" id="pricing"><div className="container pricing-wrap"><Reveal className="pricing-copy" direction="left"><span className="kicker">Pricing — invest, do not expense</span><h2>Start free. Upgrade when you feel the lift.</h2><p>This is not a cost. It is leverage. Choose the level that matches your ambition. Cancel anytime — your next move stays yours.</p><div className="pricing-grid">{plans.map((plan, index) => <Reveal key={plan.name} delay={index * .08}><div className={plan.popular ? "price-card popular" : "price-card"}>{plan.popular && <span className="popular-tag">Most popular</span>}<div className="plan-name">{plan.name}</div><div className="price">{plan.price}<small> / month</small></div><div className="price-rule" />{plan.features.map((feature) => <div className="plan-feature" key={feature}><Check size={13} />{feature}</div>)}<a href="#footer" className="plan-button">Get started <ArrowRight size={14} /></a></div></Reveal>)}</div></Reveal><Reveal className="pricing-image" direction="right"><div style={{ position: "absolute", inset: 0, backgroundImage: `url(${pricingImage})`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: "inherit" }} /><div className="image-note">Invest in<br />your future <span>♡</span></div></Reveal></div></section>

      <section className="bottom-cta"><div className="container cta-inner"><div className="cta-thumb" style={{ backgroundImage: `url(${heroImage})` }} /><Reveal><span className="kicker kicker-light">Invest in your future ♡</span><h2>Ready to play at a higher level?</h2><p>The job you want is still open. Stop leaving it to chance. Let Jobiest handle the busywork — with your approval at every step — so you can show up ready to win.</p></Reveal><Button href="#pricing">Create free account</Button><a className="button button-ghost" href="#how-it-works">See how it works</a></div></section>
    </main>
    <footer id="footer"><div className="container footer-top"><div className="footer-brand"><FooterLogo /><p>Your AI career agent. Truthful. On-demand. Yours.</p><span>You're in control.</span></div><div className="footer-links"><div><strong>Explore</strong><a href="#how-it-works">How it works</a><a href="#steps">Free tools</a><a href="#pricing">Pricing</a><a href="#footer">Blog</a></div><div><strong>Help</strong><a href="#footer">Support</a><a href="#footer">Email support</a><a href="#footer">Terms & privacy</a></div></div><div className="socials"><a href="#footer" aria-label="X"><span>X</span></a><a href="#footer" aria-label="LinkedIn"><span>in</span></a><a href="#footer" aria-label="Instagram"><span>IG</span></a></div></div><div className="container footer-bottom"><span>© 2025 Jobiest. Nothing is submitted without your approval.</span><span>Better jobs.<br /><em>Brighter futures.</em> <Sparkles size={14} /></span></div></footer>
  </div>;
}
