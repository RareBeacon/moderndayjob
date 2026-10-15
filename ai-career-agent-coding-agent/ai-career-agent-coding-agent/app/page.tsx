import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons/icons";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getUser } from "@/lib/auth";
import { websiteJsonLd, organizationJsonLd, jsonLdTag } from "@/lib/seo";
import { marketingMetadata } from "@/components/marketing/metadata";
import { PLANS, PLAN_ORDER } from "@/lib/billing/pricing";
import { AgentTimeline } from "@/components/product/product-components";
import styles from "./marketing.module.css";

export const metadata: Metadata = marketingMetadata({
  title: "Jobiest - Your AI Agent for the Job Search",
  description:
    "The AI agent for your job search: tell it your criteria once, add the jobs you want, and it tailors your CV and cover letter and submits after your approval. Start free.",
  path: "/",
});

const liveSignup = "/signup";
const liveTools = "/tools";

const frustrations = [
  "You rewrite your CV for every single job.",
  "You write cover letters late at night.",
  "You fill in the same forms, again and again.",
  "You scroll job boards on the bus, at lunch, at midnight.",
  "And most applications are met with silence.",
];

const dream = [
  "You wake up to new matching jobs, already found.",
  "Your CV and cover letter are written for each one.",
  "You review for fifteen minutes and approve.",
  "You apply to more jobs in a week than you used to in a month.",
  "The rest of your day belongs to you.",
];

const steps: { number: string; title: string; body: string; sample: string; icon: IconName }[] = [
  {
    number: "1",
    title: "Add your details once",
    body: "Your experience, your skills, and the jobs you want. This becomes your one true profile, and Jobiest uses it for everything after.",
    sample: "Takes about fifteen minutes.",
    icon: "user",
  },
  {
    number: "2",
    title: "Jobiest does the work",
    body: "It finds real, matching jobs on employer boards and writes your CV and cover letter for each one. Every document is tailored. Every fact is checked.",
    sample: "Everything waits for your review.",
    icon: "briefcase",
  },
  {
    number: "3",
    title: "You approve, it sends",
    body: "Look it over. Change anything you like. Click approve. On supported job boards, Jobiest submits the application for you.",
    sample: "You always know what went out, and when.",
    icon: "shield",
  },
];

export default async function HomePage() {
  const user = await getUser();
  const paidPlans = PLAN_ORDER.filter((code) => PLANS[code].monthlyNgn > 0);
  return (
    <MarketingShell activePath="/" authenticated={!!user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      <main className={styles.page}>
        <section data-animate data-animate-repeat className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroInner}>
            <div className={styles.heroCopy} data-animate data-animate-repeat>
              <p className={styles.eyebrow}>
                <Icon name="spark" width={17} height={17} />
                AI career agent
              </p>
              <h1 id="home-title">
                More interviews. Less job hunting. <span>You approve every send.</span>
              </h1>
              <p className={styles.heroLead}>
                Jobiest is your AI career agent. Tell it the jobs you want once. From there, it finds matching
                openings, writes your CV and cover letter for each one, and applies for you. Nothing is sent until
                you say yes.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primaryAction} href={liveSignup}>
                  Create free account
                  <Icon name="arrow-right" width={18} height={18} />
                </a>
                <a className={styles.secondaryAction} href="#how">
                  See how it works
                </a>
              </div>
              <p className={styles.heroTrust}>
                <Icon name="shield" width={19} height={19} />
                Nothing is sent until you say yes.
              </p>
              <span className={styles.heroFreeFact}>
                <Icon name="check-circle" width={16} height={16} />
                Free plan: 3 CV or cover letter generations and 10 tool uses a day
              </span>
            </div>

            <aside className={styles.heroPanel} data-parallax="0.05" aria-label="Example of the Jobiest agent at work">
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Example work</span>
                  <h2>The agent shows its work</h2>
                </div>
                <span className={styles.panelBadge}>Review first</span>
              </div>
              <AgentTimeline
                label="Example agent activity"
                events={[
                  {
                    verb: "Reviewed verified experience",
                    detail: "Compared saved evidence with the job requirements.",
                    timeLabel: "Example preparation step",
                    state: "current",
                  },
                  {
                    verb: "Flagged an unsupported claim",
                    detail: "Left it out instead of guessing.",
                    timeLabel: "Example truthfulness check",
                    state: "complete",
                  },
                ]}
              />
              <div className={styles.panelApproval}>
                <span className={styles.panelApprovalIcon}>
                  <Icon name="file" width={18} height={18} />
                </span>
                <span className={styles.panelApprovalText}>
                  <strong>CV and cover letter</strong>
                  <small>Ready for you to review</small>
                </span>
                <Icon name="arrow-right" width={18} height={18} />
              </div>
            </aside>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="frustrations-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate data-animate-repeat>
              <p className={styles.eyebrow}>Sound familiar?</p>
              <h2 id="frustrations-title">Job hunting is a full-time job. Without the pay.</h2>
              <p className={styles.sectionIntro}>
                If you are job hunting right now, you already know the routine.
              </p>
            </div>
            <ul className={styles.plainList} data-stagger data-animate-repeat>
              {frustrations.map((line) => (
                <li key={line}>
                  <Icon name="arrow-right" width={17} height={17} />
                  {line}
                </li>
              ))}
            </ul>
            <div data-animate data-animate-repeat>
              <p className={styles.sectionNote}>
                Weeks of this. Months, even. It drains the energy you should be spending on the interviews
                themselves. It doesn&apos;t have to be your life.
              </p>
              <Link className={styles.inlineCta} href="#how">
                There&apos;s a better way
                <Icon name="arrow-right" width={17} height={17} />
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="fears-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate data-animate-repeat>
              <p className={styles.eyebrow}>The hard truth</p>
              <h2 id="fears-title">It&apos;s not you. It&apos;s the numbers.</h2>
              <p>
                Every good job gets hundreds of applicants. The people who get interviews aren&apos;t better than
                you. They just applied sooner, with documents made for that exact job.
              </p>
              <p>
                And here is what nobody says out loud: the longer the search takes, the more it starts to feel like
                it&apos;s you. It isn&apos;t. The silence isn&apos;t feedback. It&apos;s just numbers. And numbers
                problems have tools.
              </p>
              <Link className={styles.inlineCta} href="#how">
                Get the numbers on your side
                <Icon name="arrow-right" width={17} height={17} />
              </Link>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="dream-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate data-animate-repeat>
              <p className={styles.eyebrow}>Picture this</p>
              <h2 id="dream-title">Your job search, handled.</h2>
              <p className={styles.sectionIntro}>Imagine your search running like this instead:</p>
            </div>
            <ul className={styles.plainList} data-stagger data-animate-repeat>
              {dream.map((line) => (
                <li key={line}>
                  <Icon name="check-circle" width={17} height={17} />
                  {line}
                </li>
              ))}
            </ul>
            <div data-animate data-animate-repeat>
              <p className={styles.sectionNote}>
                That&apos;s Jobiest. Built in Lagos for people with real skills and no time to waste. People who want
                the job, not the job hunt.
              </p>
            </div>
            <div className={styles.proofGrid} data-stagger data-animate-repeat>
              <article className={styles.proofCard}>
                <p className={styles.eyebrow}>Rule one</p>
                <h3>No lies. Ever.</h3>
                <p>
                  Your CV is built only from facts you gave us. If something is missing, we flag it for you to add.
                  We never invent experience. We never pad your achievements. What you send is what is true.
                </p>
              </article>
              <article className={styles.proofCard}>
                <p className={styles.eyebrow}>Rule two</p>
                <h3>You say yes. Or it doesn&apos;t send.</h3>
                <p>
                  Every document and every application waits for your approval. One look, one click. And you can
                  always see exactly what was sent, to whom, and when.
                </p>
              </article>
            </div>
            <div data-animate data-animate-repeat style={{ marginTop: "1.6rem" }}>
              <a className={styles.primaryAction} href={liveSignup}>
                Start free tonight
                <Icon name="arrow-right" width={18} height={18} />
              </a>
            </div>
          </div>
        </section>

        <section id="how" className={styles.section} aria-labelledby="steps-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate data-animate-repeat>
              <p className={styles.eyebrow}>How it works</p>
              <h2 id="steps-title">Three steps. Fifteen minutes to set up.</h2>
              <p className={styles.sectionIntro}>
                No new apps to learn. No complicated setup. Just this:
              </p>
            </div>
            <div className={styles.stepsGrid} data-stagger data-animate-repeat>
              {steps.map((step) => (
                <article className={styles.stepCard} key={step.number}>
                  <div className={styles.stepTop}>
                    <span className={styles.stepNumber}>{step.number}</span>
                    <Icon name={step.icon} width={22} height={22} />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <div className={styles.stepSample}>
                    <strong>What this means</strong>
                    <span>{step.sample}</span>
                  </div>
                </article>
              ))}
            </div>
            <div data-animate data-animate-repeat style={{ marginTop: "1.6rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <a className={styles.primaryAction} href={liveSignup}>
                Create free account
                <Icon name="arrow-right" width={18} height={18} />
              </a>
              <Link className={styles.inlineCta} href="/how-it-works">
                See the full three-step flow <Icon name="arrow-right" width={17} height={17} />
              </Link>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="pricing-title">
          <div className={styles.container}>
            <div className={styles.sectionHead} data-animate data-animate-repeat>
              <p className={styles.eyebrow}>Pricing</p>
              <h2 id="pricing-title">Start free. Upgrade if it works for you.</h2>
              <p>
                Free means free. No card. No trial clock. The free plan gives you 3 CV or cover letter generations
                and 10 tool uses a day, for as long as you want. When you are ready for more, paid plans add daily
                generations and the job-finding agent, from ₦5,000 a month.
              </p>
            </div>
            <div className={styles.planGrid} data-stagger data-animate-repeat>
              {paidPlans.map((code) => {
                const plan = PLANS[code];
                return (
                  <article className={`${styles.proofCard}${plan.featured ? ` ${styles.planFeatured}` : ""}`} key={code}>
                    <p className={styles.eyebrow}>
                      {plan.name}
                      {plan.featured ? <span className={styles.planBadge}>Most popular</span> : null}
                    </p>
                    <h3>₦{plan.monthlyNgn.toLocaleString("en-NG")} a month</h3>
                    <p className={styles.planGlobal}>${plan.monthlyUsd.toFixed(2)} a month globally</p>
                    <p>{plan.tagline}</p>
                    <Link className={styles.inlineCta} href="/pricing">
                      See what&apos;s included
                      <Icon name="arrow-right" width={17} height={17} />
                    </Link>
                  </article>
                );
              })}
            </div>
            <div data-animate data-animate-repeat>
              <p className={styles.sectionNote} style={{ marginTop: "1.6rem" }}>Cancel anytime from your settings.</p>
              <div style={{ marginTop: "1.2rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                <a className={styles.primaryAction} href={liveSignup}>
                  Create free account
                  <Icon name="arrow-right" width={18} height={18} />
                </a>
                <Link className={styles.inlineCta} href="/pricing">
                  Compare the full plans <Icon name="arrow-right" width={17} height={17} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="home-cta-title">
          <div className={styles.container}>
            <div className={styles.ctaBand} data-animate data-animate-repeat>
              <div>
                <h2 id="home-cta-title">The job you want is still open.</h2>
                <p>Someone will get the interview. It might as well be you. Free to start, no card, nothing sent without your yes.</p>
              </div>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <a className={styles.primaryAction} href={liveSignup}>
                  Create free account
                  <Icon name="arrow-right" width={18} height={18} />
                </a>
                <a className={styles.secondaryAction} href={liveTools}>
                  Try the free tools
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
