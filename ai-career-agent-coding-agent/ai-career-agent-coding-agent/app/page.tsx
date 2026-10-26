import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/icons/icons";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getUser } from "@/lib/auth";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo";
import { marketingMetadata } from "@/components/marketing/metadata";
import styles from "./marketing.module.css";

export const metadata: Metadata = marketingMetadata({
  title: "Jobiest — Your AI Agent for the Job Search",
  description: "Your personal AI job-search agent. Stop chasing jobs — let jobs come to you. More interviews. Less job hunting. You choose what gets sent. Start free.",
  path: "/",
});

const whatWeDo = [
  { title: "Find jobs that fit your goals.", desc: "Stop spending hours searching through opportunities that aren't right for you. On paid plans, Jobiest can discover matching roles based on your preferences." },
  { title: "Give every application a personal touch.", desc: "Your CV shouldn't look identical for every role. Jobiest helps highlight the skills and experience that matter for each opportunity." },
  { title: "Say goodbye to starting from a blank page.", desc: "Get help preparing cover letters and application answers that connect your experience to what an employer needs." },
  { title: "Spend less time filling out forms.", desc: "Jobiest can fill supported application forms, reducing repetitive work and helping you move through the process more efficiently." },
  { title: "Stay in control.", desc: "Review and approve applications before they're sent, or choose the automatic submission policy available on paid plans." },
  { title: "Know where you stand.", desc: "Keep your applications organised and track their progress instead of wondering what happened to the jobs you applied for." },
];

const faqs = [
  { q: "What is Jobiest?", a: "Jobiest is your AI job-search agent. It helps you find matching opportunities on supported job boards, prepare tailored application documents, fill supported forms, and organise your applications." },
  { q: "Is Jobiest free?", a: "Yes. The free plan costs ₦0 and includes three AI generations in total, ten career-tool uses per day, job-link analysis, and application tracking." },
  { q: "Does Jobiest find jobs for me?", a: "Matching-job discovery is available on paid plans. You can also provide a job link yourself and use Jobiest to help prepare your application." },
  { q: "Can Jobiest apply for jobs on my behalf?", a: "Jobiest can fill and submit applications through supported workflows. On paid plans, you can choose approval-first or Auto send. Some applications may require you to complete additional steps yourself." },
  { q: "Will Jobiest change or invent things on my CV?", a: "Jobiest is intended to help present your genuine experience more effectively. Review your documents carefully to ensure every detail is accurate before submitting them." },
  { q: "Do I need to know how to use AI?", a: "No specialist knowledge is needed. Set up your profile, provide your preferences, and follow the steps in your account." },
  { q: "Which plan should I choose?", a: "Start with Free if you want to explore the tools. Choose Basic for limited agent runs, Premium for a more active job search, or Max for greater daily application capacity." },
  { q: "Can Jobiest guarantee me a job?", a: "No. Jobiest helps you prepare and manage applications, but employers make the hiring decisions. No interview or job offer is guaranteed." },
  { q: "What happens if an application needs my attention?", a: "If a website requires a CAPTCHA, assessment, login, or unsupported step, you may need to complete that step yourself." },
  { q: "Can I cancel my subscription?", a: "Refer to the subscription terms in your account for the applicable cancellation process and billing conditions." },
];

export default async function HomePage() {
  const user = await getUser();
  return (
    <MarketingShell activePath="/" authenticated={!!user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      <main id="main" className={styles.page}>
        {/* HERO 1 — Stop chasing jobs */}
        <section className={styles.hero} style={{ background: "linear-gradient(180deg, #0f1e3a 0%, #162a52 100%)" }} data-animate data-animate-repeat aria-labelledby="hero1-title">
          <div className={styles.heroInner} style={{ gap: "2rem" }}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow} style={{ color: "#d7f94b" }}>✦ Your personal AI job-search agent</p>
              <h1 id="hero1-title" style={{ fontSize: "clamp(2.6rem,5vw,3.6rem)", lineHeight: 1.05 }}>Stop chasing jobs.<br /><span style={{ color: "#d7f94b" }}>Let jobs come to you.</span></h1>
              <p className={styles.heroLead} style={{ color: "#cbd5e1", maxWidth: 560 }}>Finding a job shouldn&apos;t feel like another full-time job. Jobiest helps you find opportunities, tailor your CV, write cover letters, and handle repetitive application tasks — so you can spend less time applying and more time preparing for your next big opportunity.</p>
              <div className={styles.heroActions} style={{ marginTop: 20 }}>
                <a className={styles.primaryAction} href="/signup">Get Started Free <Icon name="arrow-right" width={16} height={16} /></a>
                <a className={styles.secondaryAction} href="#how" style={{ background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.3)", color: "#fff" }}>See How It Works</a>
              </div>
              <p style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>No credit card required. Start free.</p>
              <p style={{ marginTop: 10, fontSize: 12, color: "#d7f94b", fontStyle: "italic" }}>Your job search. Your rules. Less work on your shoulders.</p>
            </div>
            <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", background: "#fff" }}>
              <Image src="/images/hero-person.jpg" alt="Woman smiling while working on laptop" width={520} height={420} style={{ width: "100%", height: "auto", display: "block" }} priority />
              <div style={{ position: "absolute", top: 14, right: 14, background: "#fff", borderRadius: 14, padding: "12px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxWidth: 220 }}>
                <strong style={{ fontSize: 12, color: "#111d35" }}>Good morning, Ada</strong>
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Your agent is working for you</p>
                <ul style={{ fontSize: 11, marginTop: 8, paddingLeft: 16, lineHeight: 1.7, color: "#374151" }}>
                  <li>Found 12 matching jobs</li>
                  <li>Tailored your CV & cover letter</li>
                  <li>Prepared application</li>
                  <li>Ready for your review</li>
                </ul>
                <span style={{ display: "inline-flex", marginTop: 8, fontSize: 11, fontWeight: 700, color: "#3b72bc" }}>View applications →</span>
              </div>
            </div>
          </div>
        </section>

        {/* PROBLEM — You know what you want */}
        <section className={styles.section} style={{ background: "#fff" }} aria-labelledby="problem-title">
          <div className={styles.container} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "2.5rem", alignItems: "center" }}>
            <div data-animate>
              <p className={styles.eyebrow} style={{ color: "#3b72bc" }}>The reality</p>
              <h2 id="problem-title" style={{ fontSize: "clamp(1.8rem,3.5vw,2.4rem)", marginTop: 8 }}>You know what you want. Getting there shouldn&apos;t be this hard.</h2>
              <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.7, color: "#475569" }}>
                <p>You find a job you&apos;re excited about.</p>
                <p style={{ marginTop: 8 }}>Then comes the work. Update your CV. Write a cover letter. Fill out the same details you&apos;ve entered a dozen times. Answer the same questions. Submit. Start all over again.</p>
                <p style={{ marginTop: 8 }}>One application becomes five hours of work. Five applications become an exhausting week. And after all that effort? Sometimes, silence.</p>
                <p style={{ marginTop: 8 }}>It&apos;s frustrating. It&apos;s tiring. And it takes time away from the very things that could help you move forward.</p>
                <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#166534" }}><Icon name="check-circle" width={14} height={14} /> You don&apos;t need another job just to get a job.</div>
              </div>
            </div>
            <div style={{ position: "relative" }} data-animate>
              <Image src="/images/life-cafe.jpg" alt="Man looking thoughtfully at laptop" width={480} height={360} style={{ width: "100%", height: "auto", borderRadius: 16, display: "block" }} />
              <div style={{ position: "absolute", top: -14, right: -10, background: "#fef9c3", borderRadius: 12, padding: 14, width: 180, transform: "rotate(2deg)", boxShadow: "0 8px 20px rgba(0,0,0,0.1)", fontSize: 11, lineHeight: 1.6 }}>
                <strong style={{ display: "block", marginBottom: 6 }}>The same cycle...</strong>
                <div>☐ Search for jobs</div><div>☐ Rewrite your CV</div><div>☐ Write cover letters</div><div>☐ Fill out forms</div><div>☐ Submit</div><div>☐ Repeat...</div>
                <em style={{ display: "block", marginTop: 8, color: "#a16207" }}>You deserve a smarter way.</em>
              </div>
            </div>
          </div>
        </section>

        {/* SOLUTION — Meet the agent */}
        <section className={`${styles.section} ${styles.sectionSoft}`} style={{ background: "#f8fafc" }} aria-labelledby="solution-title">
          <div className={styles.container} style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: "2.5rem", alignItems: "center" }}>
            <div style={{ borderRadius: 20, overflow: "hidden", background: "#fff", border: "1px solid #e2e8f0", padding: 12 }} data-animate>
              <Image src="/images/case-1-criteria.jpg" alt="Jobiest dashboard" width={480} height={320} style={{ width: "100%", height: "auto", borderRadius: 12 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, fontSize: 11 }}><strong>Tailored CV</strong><br /><span style={{ color: "#64748b" }}>For Product Designer</span></div>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, fontSize: 11 }}><strong>Cover Letter</strong><br /><span style={{ color: "#64748b" }}>Personalised</span></div>
              </div>
            </div>
            <div data-animate>
              <p className={styles.eyebrow}>The solution</p>
              <h2 id="solution-title">Meet the agent that takes the busywork out of your job search.</h2>
              <p style={{ marginTop: 10, color: "#475569", fontSize: 14, lineHeight: 1.6 }}>Imagine having someone who helps you find suitable jobs, prepares your applications, and keeps everything organised — without you having to start from scratch every time.</p>
              <p style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>That&apos;s Jobiest.</p>
              <p style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>Tell Jobiest what you&apos;re looking for. Your AI agent helps you discover matching opportunities, prepares a CV and cover letter tailored to each role, and handles supported application steps.</p>
              <p style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>You review the work and decide what happens next.</p>
              <p style={{ marginTop: 10, fontWeight: 700, fontSize: 13, color: "#111d35" }}>Less time filling out forms. More time moving your career forward.</p>
              <a className={styles.primaryAction} href="/signup" style={{ marginTop: 14 }}>Let Jobiest Do the Busywork <Icon name="arrow-right" width={14} height={14} /></a>
            </div>
          </div>
        </section>

        {/* WHAT JOBIEST DOES */}
        <section className={styles.section} aria-labelledby="features-title">
          <div className={styles.container}>
            <h2 id="features-title" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>Everything you need to make job hunting less exhausting.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14, marginTop: 28 }} data-stagger data-animate-repeat>
              {whatWeDo.map((f) => (
                <article key={f.title} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700 }}>{f.title}</h3>
                  <p style={{ marginTop: 6, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className={styles.section} style={{ background: "#f8fafc" }} aria-labelledby="how-title">
          <div className={styles.container}>
            <p className={styles.eyebrow}>That works</p>
            <h2 id="how-title">Three steps to a less stressful job search.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, marginTop: 22 }} data-stagger>
              <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20 }}><span style={{ display: "inline-flex", width: 28, height: 28, borderRadius: 999, background: "#111d35", color: "#d7f94b", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>01</span><h3 style={{ marginTop: 12, fontSize: 15 }}>Tell us what you&apos;re looking for.</h3><p style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>Set up your profile, share your experience, and tell Jobiest about the jobs you want.</p><a href="/signup" style={{ marginTop: 10, display: "inline-flex", fontSize: 12, fontWeight: 700, color: "#3b72bc" }}>Create Your Free Account →</a></article>
              <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20 }}><span style={{ display: "inline-flex", width: 28, height: 28, borderRadius: 999, background: "#111d35", color: "#d7f94b", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>02</span><h3 style={{ marginTop: 12, fontSize: 15 }}>Let your agent get to work.</h3><p style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>Jobiest helps find matching opportunities on supported job boards, tailors your application documents, and fills supported forms.</p></article>
              <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20 }}><span style={{ display: "inline-flex", width: 28, height: 28, borderRadius: 999, background: "#111d35", color: "#d7f94b", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>03</span><h3 style={{ marginTop: 12, fontSize: 15 }}>Review, approve, and move forward.</h3><p style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>Check your applications, make changes if needed, and decide when they&apos;re ready to be sent. You can also choose Auto send on paid plans.</p></article>
            </div>
            <p style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>That&apos;s it. Less repetitive work, fewer things to keep track of, and more time for your next move.</p>
          </div>
        </section>

        {/* TRUST */}
        <section className={styles.section} style={{ position: "relative", overflow: "hidden" }} aria-labelledby="trust-title">
          <Image src="/images/life-sofa.jpg" alt="" fill style={{ objectFit: "cover", opacity: 0.08 }} />
          <div className={styles.container} style={{ position: "relative" }}>
            <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }} data-animate>
              <h2 id="trust-title" style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)" }}>AI should help you get ahead, not make decisions behind your back.</h2>
              <p style={{ marginTop: 10, fontSize: 14, color: "#475569" }}>Your career matters. Your reputation matters. And the information in your CV matters. That&apos;s why Jobiest is built around your experience, your preferences, and your rules.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginTop: 22 }} data-stagger>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, textAlign: "center" }}><div style={{ width: 36, height: 36, borderRadius: 999, background: "#f0fdf4", display: "grid", placeItems: "center", margin: "0 auto" }}><Icon name="check-circle" width={18} height={18} /></div><strong style={{ display: "block", marginTop: 8, fontSize: 13 }}>Real experience.</strong><span style={{ fontSize: 12, color: "#64748b" }}>Not made-up achievements.</span></div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, textAlign: "center" }}><div style={{ width: 36, height: 36, borderRadius: 999, background: "#eff6ff", display: "grid", placeItems: "center", margin: "0 auto" }}><Icon name="shield" width={18} height={18} /></div><strong style={{ display: "block", marginTop: 8, fontSize: 13 }}>Your approval.</strong><span style={{ fontSize: 12, color: "#64748b" }}>Your choice.</span></div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, textAlign: "center" }}><div style={{ width: 36, height: 36, borderRadius: 999, background: "#fff7ed", display: "grid", placeItems: "center", margin: "0 auto" }}><Icon name="eye" width={18} height={18} /></div><strong style={{ display: "block", marginTop: 8, fontSize: 13 }}>Clear boundaries.</strong><span style={{ fontSize: 12, color: "#64748b" }}>No pretending.</span></div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, textAlign: "center" }}><div style={{ width: 36, height: 36, borderRadius: 999, background: "#fefce8", display: "grid", placeItems: "center", margin: "0 auto" }}><Icon name="user" width={18} height={18} /></div><strong style={{ display: "block", marginTop: 8, fontSize: 13 }}>Your career stays in your hands.</strong><span style={{ fontSize: 12, color: "#64748b" }}>You remain in charge.</span></div>
            </div>
          </div>
        </section>

        {/* FREE TOOLS */}
        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="tools-title">
          <div className={styles.container}>
            <h2 id="tools-title">Not ready for an AI agent? Start with one useful tool.</h2>
            <p style={{ marginTop: 6, color: "#64748b", fontSize: 14 }}>Explore Jobiest&apos;s free career tools to help you prepare your CV, understand job descriptions, and present yourself more clearly.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10, marginTop: 18 }} data-stagger>
              <a href="/tools" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, fontWeight: 700 }}>Resume Scanner<br /><span style={{ fontWeight: 400, color: "#64748b" }}>Check your CV</span></a>
              <a href="/tools" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, fontWeight: 700 }}>Job Description Analyzer<br /><span style={{ fontWeight: 400, color: "#64748b" }}>Understand role</span></a>
              <a href="/tools" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, fontWeight: 700 }}>Cover Letter Writer<br /><span style={{ fontWeight: 400, color: "#64748b" }}>Get a starting point</span></a>
              <a href="/tools" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, fontWeight: 700 }}>Resume Summary<br /><span style={{ fontWeight: 400, color: "#64748b" }}>Describe clearly</span></a>
              <a href="/tools" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, fontWeight: 700 }}>LinkedIn Headline<br /><span style={{ fontWeight: 400, color: "#64748b" }}>More focused</span></a>
            </div>
            <a className={styles.primaryAction} href="/tools" style={{ marginTop: 16 }}>Explore Free Career Tools →</a>
          </div>
        </section>

        {/* PRICING */}
        <section className={styles.section} aria-labelledby="pricing-title">
          <div className={styles.container}>
            <p className={styles.eyebrow}>Pricing</p>
            <h2 id="pricing-title">Start free. Get more help when you need it.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginTop: 18 }} data-stagger>
              <article style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, background: "#fff" }}><strong style={{ fontSize: 12 }}>FREE — ₦0 forever</strong><h3 style={{ fontSize: 14, marginTop: 6 }}>Get to know Jobiest.</h3><ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 16, lineHeight: 1.8 }}><li>3 AI generations total</li><li>10 tool uses/day</li><li>Job-link analysis</li><li>Application tracking</li></ul><a href="/signup" style={{ marginTop: 10, display: "inline-flex", fontSize: 12, fontWeight: 700, color: "#3b72bc" }}>Start Free →</a></article>
              <article style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, background: "#fff" }}><strong style={{ fontSize: 12 }}>BASIC — ₦5,000/month</strong><h3 style={{ fontSize: 14, marginTop: 6 }}>For a more organised search.</h3><ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 16, lineHeight: 1.8 }}><li>Everything in Free</li><li>3 AI generations/day</li><li>50 tool uses/day</li><li>2 agent runs total</li></ul><a href="/pricing" style={{ marginTop: 10, display: "inline-flex", fontSize: 12, fontWeight: 700, color: "#3b72bc" }}>Choose Basic →</a></article>
              <article style={{ border: "2px solid #d7f94b", borderRadius: 16, padding: 16, background: "#fffef0" }}><strong style={{ fontSize: 12 }}>PREMIUM — ₦10,000/month <span style={{ background: "#d7f94b", padding: "2px 6px", borderRadius: 999, fontSize: 10 }}>MOST POPULAR</span></strong><h3 style={{ fontSize: 14, marginTop: 6 }}>For people actively looking.</h3><ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 16, lineHeight: 1.8 }}><li>Everything in Basic</li><li>10 AI generations/day</li><li>Daily discovery</li><li>10 apps/day</li></ul><a href="/pricing" style={{ marginTop: 10, display: "inline-flex", background: "#d7f94b", color: "#111d35", padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Choose Premium →</a></article>
              <article style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, background: "#fff" }}><strong style={{ fontSize: 12 }}>MAX — ₦20,000/month</strong><h3 style={{ fontSize: 14, marginTop: 6 }}>For more capacity.</h3><ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 16, lineHeight: 1.8 }}><li>Everything in Premium</li><li>20 AI generations/day</li><li>Daily discovery</li><li>20 apps/day</li></ul><a href="/pricing" style={{ marginTop: 10, display: "inline-flex", fontSize: 12, fontWeight: 700, color: "#3b72bc" }}>Choose Max →</a></article>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="faq-title">
          <div className={styles.container}>
            <h2 id="faq-title">Got questions? We&apos;ve got answers.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px", marginTop: 18 }} className={styles.faqList}>
              {faqs.slice(0, 5).map((f) => (<details key={f.q} style={{ borderBottom: "1px solid #e2e8f0", padding: "12px 0" }}><summary style={{ fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{f.q}</summary><p style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>{f.a}</p></details>))}
              {faqs.slice(5).map((f) => (<details key={f.q} style={{ borderBottom: "1px solid #e2e8f0", padding: "12px 0" }}><summary style={{ fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{f.q}</summary><p style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>{f.a}</p></details>))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className={styles.section} style={{ background: "linear-gradient(180deg, #0f1e3a 0%, #162a52 100%)", color: "#fff" }} aria-labelledby="cta-title">
          <div className={styles.container} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24, alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#d7f94b", fontWeight: 700 }}>Your next opportunity is worth the effort</p>
              <h2 id="cta-title" style={{ marginTop: 8, fontSize: "clamp(1.6rem,3vw,2.2rem)", color: "#fff" }}>Your job search doesn&apos;t have to take over your life.</h2>
              <p style={{ marginTop: 10, fontSize: 14, color: "#cbd5e1" }}>You bring the ambition. We&apos;ll help with the busywork.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <a href="/signup" style={{ background: "#d7f94b", color: "#111d35", padding: "10px 18px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>Get Started Free →</a>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", alignSelf: "center" }}>No credit card required.</span>
              </div>
            </div>
            <div style={{ borderRadius: 16, overflow: "hidden" }}><Image src="/images/life-sofa.jpg" alt="Person relaxing after job search" width={480} height={320} style={{ width: "100%", height: "auto", display: "block" }} /></div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
