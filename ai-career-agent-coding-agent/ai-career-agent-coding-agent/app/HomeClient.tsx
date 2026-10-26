"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
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

const checks = [
  "You bookmark a promising role during lunch, telling yourself you’ll apply tonight. Then the day runs long, and the tab stays open for another week.",
  "You reshape the same CV for the fifth time, trying to sound like the person you know you can be.",
  "You type your work history into one more form, field by field, hoping this application will finally lead somewhere.",
  "You search on the commute, after dinner, and in the quiet moments that were supposed to be yours.",
  "And when the silence or rejection comes, starting the next application takes a little more out of you.",
];

const plans = [
  { name: "Basic", price: "₦5,000", detail: "monthly", features: ["Up to 10 applications per month", "AI-tailored CV & cover letter", "Job tracking & notifications"] },
  { name: "Premium", price: "₦10,000", detail: "monthly", popular: true, features: ["Up to 30 applications per month", "Advanced AI tailoring", "Priority support", "Full application tracking"] },
  { name: "Max", price: "₦20,000", detail: "monthly", features: ["Unlimited applications", "Premium AI assistance", "Dedicated support", "Advanced application tracking"] },
];

function Logo() {
  return <a href="#top" className="brand" aria-label="Jobiest home"><span className="brand-mark"><span /></span><span>jobiest</span></a>;
}

function FooterLogo() {
  return <a href="#top" className="brand footer-wordmark" aria-label="Jobiest home"><span className="brand-mark"><span /></span><span>jobiest</span></a>;
}

function Button({ children, secondary = false }: { children: React.ReactNode; secondary?: boolean }) {
  return <a className={secondary ? "button button-secondary" : "button"} href="#pricing">{children}<ArrowRight size={15} strokeWidth={2.5} /></a>;
}

function ApprovalCard() {
  return <div className="approval-card">
    <div className="approval-head"><div><span className="eyebrow">Job Application Review</span><strong>Senior Frontend Developer</strong></div><span className="status status-lime">Needs your approval</span></div>
    <div className="approval-rule"><Check size={13} /><span>CV tailored to this role</span><b>View</b></div>
    <div className="approval-rule"><Check size={13} /><span>Matches 4/5 required skills</span><b>Verified</b></div>
    <div className="approval-rule warn"><Sparkles size={13} /><span>Flagged unsupported claim</span><b>Review</b></div>
    <div className="approval-rule"><FileText size={13} /><span>CV <small>Tailored for this role</small></span><b>Ready</b></div>
    <div className="approval-rule"><FileText size={13} /><span>Cover letter <small>AI generated and personalised</small></span><b>Ready</b></div>
    <button className="approval-action">Review & approve <ArrowRight size={14} /></button>
  </div>;
}

function StepCard({ number, icon, title, children, tag }: { number: string; icon: React.ReactNode; title: string; children: React.ReactNode; tag?: string }) {
  return <div className="step-card"><div className="step-number">{number}</div><div className="step-icon">{icon}</div><h3>{title}</h3><p>{children}</p>{tag && <span className="mini-tag">{tag}</span>}</div>;
}

export default function Home({ authenticated }: { authenticated?: boolean } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="site-shell" id="top">
    <header className="site-header">
      <div className="nav-wrap"><Logo /><nav className={menuOpen ? "nav-links open" : "nav-links"}><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#steps" onClick={() => setMenuOpen(false)}>Free tools</a><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a><a href="#footer" onClick={() => setMenuOpen(false)}>Blog</a><a href="#footer" onClick={() => setMenuOpen(false)}>About</a></nav><div className="nav-actions"><a className="login-link" href="#footer">Log in</a><Button>Get started free</Button></div><button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div>
    </header>

    <main>
      <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(3,17,28,.96) 0%, rgba(3,17,28,.82) 36%, rgba(3,17,28,.16) 74%), url(${heroImage})` }}>
        <div className="container hero-content"><div className="hero-copy"><h1>Land more<br />interviews.<br /><span>Skip the busywork.</span><br /><span>Get closer to work you love.</span></h1><p>Paste a job link and get a truthful, tailored application in minutes — so you spend less time rewriting CVs and more time meeting the teams you want to join. Review everything, stay in control, and move closer to your next great role.</p><div className="hero-actions"><Button>Start for free</Button><a href="#how-it-works" className="button button-ghost"><CirclePlay size={16} /> See how it works</a></div><div className="hero-note"><ShieldCheck size={14} /> You approve every application before it goes anywhere.</div></div><ApprovalCard /></div><div className="hero-dots">•••••</div></section>

      <section className="story-section reality"><div className="container split-layout"><div className="story-copy"><span className="kicker">The reality</span><h2>Job hunting is a full-time job.<br />Without the pay.</h2><p>You’re already showing up for work, family, bills, and everything else life asks of you. Then, somewhere between dinner and bed, the job search begins: one more listing, one more CV edit, one more form. It can start to feel like you need a second job just to find a better first one.</p><ul className="check-list">{checks.map((item) => <li key={item}><span><Check size={12} /></span>{item}</li>)}</ul><p className="muted">A slow reply doesn’t mean you’re not capable. A difficult application process doesn’t define your worth. Jobiest takes on the repetitive searching and preparation, so you can keep your energy for the conversations—and the life—you’re working toward.</p></div><div className="story-visual" style={{ backgroundImage: `url(${realityImage})` }}><div className="scribble">Let Jobiest handle<br />the busy work... <ArrowRight size={23} /></div><div className="task-stack"><div>Find relevant roles</div><div>Tailor your CV</div><div>Write your letter</div><div>Complete the form</div><div>Prepare to submit</div></div></div></div></section>

      <section className="story-section truth"><div className="container split-layout reverse"><div className="story-copy"><span className="kicker">The hard truth</span><h2>It’s not you. It’s the process.</h2><p>You know what you can do. But between crowded listings, rushed applications, and forms that ask you to repeat your story, it’s easy to feel like you’re falling behind before anyone has even read your CV.</p><p className="muted">Your experience deserves a fair shot. Jobiest helps put it into words for each role—without inventing credentials or taking the decision out of your hands.</p><a className="text-link" href="#how-it-works">Put your experience in the right places <ArrowRight size={15} /></a></div><div className="laptop-visual"><div className="laptop"><div className="screen"><div className="screen-bar" /><div className="screen-lines"><i /><i /><i /><i /><i /></div></div><div className="laptop-base" /></div><div className="ats-card"><span className="check-bubble"><Check size={14} /></span><strong>ATS Optimised</strong><p><Check size={12} /> Keywords matched</p><p><Check size={12} /> Skills aligned</p><p><Check size={12} /> Formatting ready</p></div></div></div></section>

      <section className="story-section how" id="how-it-works"><div className="container split-layout"><div className="story-copy"><span className="kicker">How it works</span><h2>Your job search, handled.</h2><p>You set the direction. Jobiest helps with the searching and preparation. You review every detail and decide what gets sent.</p><ul className="check-list compact"><li><span><Check size={12} /></span>Find relevant opportunities that fit your experience and goals.</li><li><span><Check size={12} /></span>Build a truthful CV and cover letter tailored to each role.</li><li><span><Check size={12} /></span>Review, edit, and approve before anything is submitted.</li><li><span><Check size={12} /></span>Track every application and spend your time preparing for interviews.</li></ul><Button>Start for free</Button></div><div className="story-visual how-visual" style={{ backgroundImage: `url(${howImage})` }}><div className="scribble dark-scribble">Less effort.<br />More opportunities.<ArrowRight size={23} /></div><div className="floating-notification"><span className="check-bubble"><Check size={13} /></span><div><strong>Application submitted!</strong><small>Only after your approval</small></div><ChevronRight size={16} /></div></div></div></section>

      <section className="steps-section" id="steps"><div className="container"><div className="section-intro"><span className="kicker">Three simple steps</span><h2>Three steps. Fifteen minutes to set up.</h2><p>Tell Jobiest what matters to you. Let it handle the repetitive parts. Keep the decision yours.</p></div><div className="steps-grid"><StepCard number="1" icon={<BriefcaseBusiness size={20} />} title="Tell us what you want next">Tell us what you’ve done, what you’re good at, and what you want your next chapter to look like.</StepCard><StepCard number="2" icon={<Sparkles size={20} />} title="Tailor and prepare" tag="Takes ~15 minutes">Jobiest finds roles that fit and prepares a truthful, tailored application. You can check every document and answer before it’s ready to send.</StepCard><StepCard number="3" icon={<Search size={20} />} title="Approve and move forward">Approve only the applications you feel good about. Follow their progress, and use the time you saved to prepare for what comes next.</StepCard></div></div></section>

      <section className="pricing-section" id="pricing"><div className="container pricing-wrap"><div className="pricing-copy"><span className="kicker">Pricing</span><h2>Start free. Upgrade if it works for you.</h2><p>Choose the support that fits your search. Cancel anytime — your next move should still feel like yours.</p><div className="pricing-grid">{plans.map((plan) => <div className={plan.popular ? "price-card popular" : "price-card"} key={plan.name}>{plan.popular && <span className="popular-tag">Most popular</span>}<div className="plan-name">{plan.name}</div><div className="price">{plan.price}<small> / month</small></div><div className="price-rule" />{plan.features.map((feature) => <div className="plan-feature" key={feature}><Check size={13} />{feature}</div>)}<a href="#footer" className="plan-button">Get started <ArrowRight size={14} /></a></div>)}</div></div><div className="pricing-image" style={{ backgroundImage: `url(${pricingImage})` }}><div className="image-note">Invest in<br />your future <span>♡</span></div></div></div></section>

      <section className="bottom-cta"><div className="container cta-inner"><div className="cta-thumb" style={{ backgroundImage: `url(${heroImage})` }} /><div><span className="kicker kicker-light">Ready for your next opportunity?</span><h2>The job you want is still open.</h2><p>You keep showing up for your goals. Let Jobiest handle the busywork—with your approval at every step.</p></div><Button>Create free account</Button><a className="button button-ghost" href="#steps">See how it works</a></div></section>
    </main>

    <footer id="footer"><div className="container footer-top"><div className="footer-brand"><FooterLogo /><p>Your AI career agent. Truthful. On-demand. Yours.</p><span>You're in control.</span></div><div className="footer-links"><div><strong>Explore</strong><a href="#how-it-works">How it works</a><a href="#steps">Free tools</a><a href="#pricing">Pricing</a><a href="#footer">Blog</a></div><div><strong>Help</strong><a href="#footer">Support</a><a href="#footer">Email support</a><a href="#footer">Terms & privacy</a></div></div><div className="socials"><a href="#footer" aria-label="Twitter"><span>X</span></a><a href="#footer" aria-label="LinkedIn"><span>in</span></a><a href="#footer" aria-label="Instagram"><span>IG</span></a></div></div><div className="container footer-bottom"><span>© 2025 Jobiest. Nothing is submitted without your approval.</span><span>Better jobs.<br /><em>Brighter futures.</em> <Sparkles size={14} /></span></div></footer>
  </div>;
}
