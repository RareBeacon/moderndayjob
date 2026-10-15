import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons/icons";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getUser } from "@/lib/auth";
import { breadcrumbJsonLd, jsonLdTag } from "@/lib/seo";
import { marketingMetadata } from "@/components/marketing/metadata";
import { AgentTimeline } from "@/components/product/product-components";
import styles from "../marketing.module.css";

export const metadata: Metadata = marketingMetadata({
  title: "How the Jobiest Agent Works in 3 Steps",
  description:
    "Three steps between you and a working job agent: build your profile, bring the jobs you want, then approve and track every send.",
  path: "/how-it-works",
});

type Step = {
  number: string;
  title: string;
  body: string;
  sample: string;
  icon: IconName;
};

const steps: Step[] = [
  {
    number: "1",
    title: "Build a truthful profile",
    body: "Tell Jobiest about your experience, skills, target roles, and location preferences. Every field becomes a fact the agent can draw from. Missing information is flagged, not filled in.",
    sample: "Your verified facts become the source of every document.",
    icon: "user",
  },
  {
    number: "2",
    title: "Bring the job",
    body: "Paste the job link and, when useful, the job description. The agent studies the requirements against your profile, then prepares a tailored CV and role-specific cover letter from your verified experience.",
    sample: "Gaps stay visible. No filler. No invented credentials.",
    icon: "briefcase",
  },
  {
    number: "3",
    title: "Approve and track",
    body: "Every prepared application arrives with a preview. Read the documents and job details, edit if needed, then approve or ask for changes. Your dashboard keeps the application status visible.",
    sample: "You are always the person who decides what gets sent.",
    icon: "shield",
  },
];

const activityEvents = [
  {
    verb: "Compared the role requirements",
    detail: "Checked responsibilities and skills against your saved experience.",
    timeLabel: "Example preparation step",
    state: "complete" as const,
  },
  {
    verb: "Kept unsupported claims out",
    detail: "Left a gap visible instead of inventing a credential.",
    timeLabel: "Example truthfulness check",
    state: "complete" as const,
  },
  {
    verb: "Prepared documents for review",
    detail: "Tailored a CV and cover letter from verified facts.",
    timeLabel: "Example status",
    state: "current" as const,
  },
];

export default async function HowItWorksPage() {
  const user = await getUser();
  return (
    <MarketingShell activePath="/how-it-works" authenticated={!!user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'How it works', path: '/how-it-works' }])) }} />
      <main className={styles.page}>
        <header className={styles.pageHero}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>How it works</p>
            <h1>Three steps between you and a working job agent.</h1>
            <p className={styles.pageLead}>
              Build a truthful profile once. Let the agent handle the repetitive preparation. Approve every application before it sends.
            </p>
          </div>
        </header>

        <section data-animate className={styles.section} aria-labelledby="flow-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>The flow</p>
              <h2 id="flow-title">The agent works from what you can prove.</h2>
              <p>You set the criteria and add jobs you want to pursue. The agent prepares the next useful step, with your approval ahead of any send.</p>
            </div>
            <div className={styles.stepsGrid}>
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
          </div>
        </section>

        <section data-animate className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="activity-title">
          <div className={styles.container}>
            <div className={styles.proofGrid}>
              <article className={styles.proofCard}>
                <p className={styles.eyebrow}>Inside the preparation</p>
                <h2 id="activity-title" className={styles.proofTitle}>You can see what the agent did.</h2>
                <p>The activity trail makes the work legible before you make a decision.</p>
                <AgentTimeline label="Example agent activity" events={activityEvents} />
              </article>

              <article className={styles.proofCard}>
                <p className={styles.eyebrow}>The approval moment</p>
                <h2 className={styles.proofTitle}>Powerful because it is clear.</h2>
                <div className={styles.approvalPreview}>
                  <div className={styles.approvalPreviewHeader}>
                    <span className={styles.panelBadge}>Example screen</span>
                    <strong>Waiting for your review</strong>
                  </div>
                  <p>Job you added</p>
                  <div className={styles.approvalPreviewDoc}>
                    <Icon name="file" width={20} height={20} />
                    <span><strong>Tailored CV</strong><small>Prepared from your verified facts</small></span>
                  </div>
                  <div className={styles.approvalPreviewDoc}>
                    <Icon name="file" width={20} height={20} />
                    <span><strong>Cover letter</strong><small>Matched to the job you chose</small></span>
                  </div>
                  <p className={styles.approvalPreviewNote}>Illustrative layout only. No real application or result is shown.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section data-animate className={styles.section} aria-labelledby="how-cta-title">
          <div className={styles.container}>
            <div className={styles.ctaBand}>
              <div>
                <h2 id="how-cta-title">Start with the facts you already have.</h2>
                <p>Try the public tools or create a free account when you are ready to build your profile.</p>
              </div>
              <Link className={styles.primaryAction} href="/tools">
                Try the free tools <Icon name="arrow-right" width={18} height={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
