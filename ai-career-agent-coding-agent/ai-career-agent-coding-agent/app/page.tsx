import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons/icons";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getUser } from "@/lib/auth";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo";
import { marketingMetadata } from "@/components/marketing/metadata";
import styles from "./marketing.module.css";

export const metadata: Metadata = marketingMetadata({
  title: "Jobiest — Your AI Agent for the Job Search",
  description: "Your personal AI job-search agent. Stop chasing jobs — let jobs come to you. Find opportunities, tailor CVs and cover letters, and track applications in one place. Start free.",
  path: "/",
});

const features = [
  { title: "Find jobs that fit your goals.", body: "Stop spending hours searching through opportunities that aren't right for you. On paid plans, Jobiest can discover matching roles based on your preferences.", icon: "search" as IconName },
  { title: "Give every application a personal touch.", body: "Your CV shouldn't look identical for every role. Jobiest helps highlight the skills and experience that matter for each opportunity.", icon: "file" as IconName },
  { title: "Say goodbye to starting from a blank page.", body: "Get help preparing cover letters and application answers that connect your experience to what an employer needs.", icon: "spark" as IconName },
  { title: "Spend less time filling out forms.", body: "Jobiest can fill supported application forms, reducing repetitive work and helping you move through the process more efficiently.", icon: "clock" as IconName },
  { title: "Stay in control.", body: "Review and approve applications before they're sent, or choose the automatic submission policy available on paid plans.", icon: "shield" as IconName },
  { title: "Know where you stand.", body: "Keep your applications organised and track their progress instead of wondering what happened to the jobs you applied for.", icon: "eye" as IconName },
];

const tools = [
  { name: "Resume Scanner", desc: "Check your CV for common issues." },
  { name: "Job Description Analyzer", desc: "Understand what an employer is looking for." },
  { name: "Cover Letter Writer", desc: "Get a starting point for your next cover letter." },
  { name: "Resume Summary Generator", desc: "Describe your experience more clearly." },
  { name: "LinkedIn Headline Builder", desc: "Make your professional profile more focused." },
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
        {/* 1. HERO */}
        <section className={styles.hero} data-animate data-animate-repeat aria-labelledby="home-title">
          <div className={styles.heroInner}>
            <div className={styles.heroCopy} data-animate data-animate-repeat>
              <p className={styles.eyebrow}><Icon name="spark" width={16} height={16} /> Your personal AI job-search agent</p>
              <h1 id="home-title">Stop chasing jobs. <span>Let jobs come to you.</span></h1>
              <p className={styles.heroLead}>Finding a job shouldn&apos;t feel like another full-time job. Jobiest helps you find opportunities, tailor your CV, write cover letters, and handle repetitive application tasks — so you can spend less time applying and more time preparing for your next big opportunity.</p>
              <div className={styles.heroActions}>
                <a className={styles.primaryAction} href="/signup">Get Started Free <Icon name="arrow-right" width={18} height={18} /></a>
                <a className={styles.secondaryAction} href="#how">See How It Works</a>
              </div>
              <p className={styles.heroTrust}><Icon name="check-circle" width={16} height={16} /> No credit card required. Start free.</p>
              <p style={{ marginTop: 12, color: "#cbd5e1", fontSize: 13, fontStyle: "italic" }}>Your job search. Your rules. Less work on your shoulders.</p>
            </div>
            <aside className={styles.heroPanel} data-parallax="0.05" aria-label="Good morning preview">
              <div style={{ padding: 14, border: "1px solid var(--color-line)", borderRadius: 16, background: "#fff" }}>
                <strong style={{ fontSize: 14 }}>Good morning, Ada</strong>
                <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 6 }}>Your agent is working for you</p>
                <ul style={{ marginTop: 10, fontSize: 12, lineHeight: 1.8, paddingLeft: 16 }}>
                  <li>Found 12 matching jobs</li>
                  <li>Tailored your CV & cover letter</li>
                  <li>Prepared application</li>
                  <li>Ready for your review</li>
                </ul>
                <Link href="/dashboard" className={styles.inlineCta}>View applications →</Link>
              </div>
            </aside>
          </div>
        </section>

        {/* 2. PROBLEM */}
        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="problem-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate data-animate-repeat>
              <p className={styles.eyebrow}>The reality</p>
              <h2 id="problem-title">You know what you want. Getting there shouldn&apos;t be this hard.</h2>
            </div>
            <div style={{ maxWidth: 680, color: "var(--color-muted)", fontSize: "var(--text-15)", lineHeight: 1.7 }} data-animate>
              <p>You find a job you&apos;re excited about.</p>
              <p style={{ marginTop: 10 }}>Then comes the work.</p>
              <p style={{ marginTop: 10 }}>Update your CV. Write a cover letter. Fill out the same details you&apos;ve entered a dozen times. Answer the same questions. Submit. Start all over again.</p>
              <p style={{ marginTop: 10 }}>One application becomes five hours of work. Five applications become an exhausting week.</p>
              <p style={{ marginTop: 10 }}>And after all that effort? Sometimes, silence.</p>
              <p style={{ marginTop: 10 }}>It&apos;s frustrating. It&apos;s tiring. And it takes time away from the very things that could help you move forward.</p>
              <p style={{ marginTop: 16, fontWeight: 700, color: "var(--color-ink)" }}>You don&apos;t need another job just to get a job.</p>
              <p>You need a better way to find opportunities and apply for them.</p>
            </div>
          </div>
        </section>

        {/* 3. SOLUTION */}
        <section className={styles.section} aria-labelledby="solution-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate>
              <p className={styles.eyebrow}>The solution</p>
              <h2 id="solution-title">Meet the agent that takes the busywork out of your job search.</h2>
              <p>Imagine having someone who helps you find suitable jobs, prepares your applications, and keeps everything organised — without you having to start from scratch every time.</p>
              <p>That&apos;s Jobiest.</p>
              <p>Tell Jobiest what you&apos;re looking for. Your AI agent helps you discover matching opportunities, prepares a CV and cover letter tailored to each role, and handles supported application steps.</p>
              <p>You review the work and decide what happens next.</p>
              <p style={{ fontWeight: 700, color: "var(--color-ink)" }}>Less time filling out forms. More time moving your career forward.</p>
              <div style={{ marginTop: 14 }}>
                <a className={styles.primaryAction} href="/signup">Let Jobiest Do the Busywork <Icon name="arrow-right" width={16} height={16} /></a>
              </div>
            </div>
          </div>
        </section>

        {/* 4. WHAT JOBIEST DOES */}
        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="features-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate>
              <h2 id="features-title">Everything you need to make job hunting less exhausting.</h2>
            </div>
            <div className={styles.stepsGrid} data-stagger data-animate-repeat>
              {features.map((f) => (
                <article key={f.title} className={styles.stepCard}>
                  <div className={styles.stepTop}><Icon name={f.icon} width={20} height={20} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. HOW IT WORKS */}
        <section id="how" className={styles.section} aria-labelledby="steps-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate>
              <p className={styles.eyebrow}>How it works</p>
              <h2 id="steps-title">Three steps to a less stressful job search.</h2>
            </div>
            <div className={styles.stepsGrid} data-stagger>
              <article className={styles.stepCard}><span className={styles.stepNumber}>01</span><h3>Tell us what you&apos;re looking for.</h3><p>Set up your profile, share your experience, and tell Jobiest about the jobs you want.</p></article>
              <article className={styles.stepCard}><span className={styles.stepNumber}>02</span><h3>Let your agent get to work.</h3><p>Jobiest helps find matching opportunities on supported job boards, tailors your application documents, and fills supported forms.</p></article>
              <article className={styles.stepCard}><span className={styles.stepNumber}>03</span><h3>Review, approve, and move forward.</h3><p>Check your applications, make changes if needed, and decide when they&apos;re ready to be sent. You can also choose Auto send on paid plans.</p></article>
            </div>
            <p style={{ marginTop: 12, color: "var(--color-muted)", fontSize: 13 }}>That&apos;s it. Less repetitive work, fewer things to keep track of, and more time for your next move.</p>
            <div style={{ marginTop: 16 }}><a className={styles.primaryAction} href="/signup">Create Your Free Account <Icon name="arrow-right" width={16} height={16} /></a></div>
          </div>
        </section>

        {/* 6. TRUST */}
        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="trust-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate>
              <h2 id="trust-title">AI should help you get ahead, not make decisions behind your back.</h2>
              <p>Your career matters. Your reputation matters. And the information in your CV matters. That&apos;s why Jobiest is built around your experience, your preferences, and your rules.</p>
            </div>
            <div className={styles.proofGrid} data-stagger>
              <article className={styles.proofCard}><h3>Real experience. Not made-up achievements.</h3><p>Your applications should reflect what you&apos;ve actually done and what you can genuinely offer.</p></article>
              <article className={styles.proofCard}><h3>Your approval. Your choice.</h3><p>Review applications before submission by default, or configure Auto send on paid plans.</p></article>
              <article className={styles.proofCard}><h3>Clear boundaries. No pretending.</h3><p>Jobiest submits applications through supported workflows. If a job site requires a step your agent can&apos;t complete, you can finish it yourself.</p></article>
              <article className={styles.proofCard}><h3>Your career stays in your hands.</h3><p>Jobiest helps you do the work. You remain in charge of your decisions.</p></article>
            </div>
          </div>
        </section>

        {/* 7. FREE TOOLS */}
        <section className={styles.section} aria-labelledby="tools-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate>
              <p className={styles.eyebrow}>Free career tools</p>
              <h2 id="tools-title">Not ready for an AI agent? Start with one useful tool.</h2>
              <p>Small improvements can make your next application easier. Explore Jobiest&apos;s free career tools to help you prepare your CV, understand job descriptions, and present yourself more clearly.</p>
            </div>
            <div className={styles.toolGrid} data-stagger>
              {tools.map((t) => (
                <a key={t.name} href="/tools" className={styles.toolLink}>{t.name} <Icon name="arrow-right" width={14} height={14} /></a>
              ))}
            </div>
            <p style={{ marginTop: 12, color: "var(--color-muted)", fontSize: 13 }}>And that&apos;s just the beginning.</p>
            <div style={{ marginTop: 16 }}><a className={styles.primaryAction} href="/tools">Explore Free Career Tools <Icon name="arrow-right" width={16} height={16} /></a></div>
            <p style={{ marginTop: 10, color: "var(--color-muted)", fontSize: 13 }}>Start with the tools. Upgrade to an AI agent when you&apos;re ready.</p>
          </div>
        </section>

        {/* 8. PRICING */}
        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="pricing-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate>
              <h2 id="pricing-title">Start free. Get more help when you need it.</h2>
              <p>No need to commit before you know what works for you. Try Jobiest for free, explore the tools, and choose a paid plan when you want more help managing your job search.</p>
            </div>
            <div className={styles.planGrid} data-stagger style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 }}>
              <article className={styles.proofCard}><p className={styles.eyebrow}>Free — ₦0 forever</p><h3>Get to know Jobiest.</h3><ul className={styles.proofList}><li><Icon name="check-circle" width={14} height={14} />3 AI generations in total</li><li><Icon name="check-circle" width={14} height={14} />10 career-tool uses per day</li><li><Icon name="check-circle" width={14} height={14} />Job-link analysis</li><li><Icon name="check-circle" width={14} height={14} />Application tracking</li></ul><a className={styles.inlineCta} href="/signup">Start Free →</a></article>
              <article className={styles.proofCard}><p className={styles.eyebrow}>Basic — ₦5,000/month</p><h3>For a more organised job search.</h3><ul className={styles.proofList}><li><Icon name="check-circle" width={14} height={14} />Everything in Free</li><li><Icon name="check-circle" width={14} height={14} />3 AI generations per day</li><li><Icon name="check-circle" width={14} height={14} />50 career-tool uses per day</li><li><Icon name="check-circle" width={14} height={14} />2 agent runs in total</li></ul><a className={styles.inlineCta} href="/pricing">Choose Basic →</a></article>
              <article className={styles.proofCard} style={{ borderColor: "var(--color-lime)", background: "#fffef0" }}><p className={styles.eyebrow}>Premium — ₦10,000/month <span style={{ background: "var(--color-lime)", padding: "2px 6px", borderRadius: 999, fontSize: 10, marginLeft: 6 }}>MOST POPULAR</span></p><h3>For people actively looking.</h3><ul className={styles.proofList}><li><Icon name="check-circle" width={14} height={14} />Everything in Basic</li><li><Icon name="check-circle" width={14} height={14} />10 AI generations per day</li><li><Icon name="check-circle" width={14} height={14} />Daily matching-job discovery</li><li><Icon name="check-circle" width={14} height={14} />10 agent applications per day</li></ul><a className={styles.primaryAction} href="/pricing" style={{ marginTop: 12 }}>Choose Premium →</a></article>
              <article className={styles.proofCard}><p className={styles.eyebrow}>Max — ₦20,000/month</p><h3>For a job search that needs more capacity.</h3><ul className={styles.proofList}><li><Icon name="check-circle" width={14} height={14} />Everything in Premium</li><li><Icon name="check-circle" width={14} height={14} />20 AI generations per day</li><li><Icon name="check-circle" width={14} height={14} />Daily matching-job discovery</li><li><Icon name="check-circle" width={14} height={14} />20 agent applications per day</li></ul><a className={styles.inlineCta} href="/pricing">Choose Max →</a></article>
            </div>
            <p style={{ marginTop: 14, color: "var(--color-muted)", fontSize: 12 }}><em>Choose the plan that fits your needs. Review the limits and subscription terms before upgrading.</em></p>
          </div>
        </section>

        {/* 9. FAQ */}
        <section className={styles.section} aria-labelledby="faq-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate><h2 id="faq-title">Got questions? We&apos;ve got answers.</h2></div>
            <div className={styles.faqList} data-stagger>
              {faqs.map((f) => (
                <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
              ))}
            </div>
          </div>
        </section>

        {/* 10. FINAL CTA */}
        <section className={styles.section} aria-labelledby="cta-title">
          <div className={styles.container}>
            <div className={styles.ctaBand} data-animate>
              <div>
                <h2 id="cta-title">Your next opportunity is worth the effort.</h2>
                <p>Your job search doesn&apos;t have to take over your life. You&apos;ve worked hard to build your skills. Now it&apos;s time to make the process easier.</p>
                <p style={{ marginTop: 8, fontWeight: 700, color: "#fff" }}>You bring the ambition. We&apos;ll help with the busywork.</p>
              </div>
              <a className={styles.primaryAction} href="/signup">Get Started Free <Icon name="arrow-right" width={16} height={16} /></a>
            </div>
            <p style={{ marginTop: 10, color: "var(--color-muted)", fontSize: 12, textAlign: "center" }}>No credit card required. Your next step starts here.</p>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
