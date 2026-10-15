import type { Metadata } from "next";
import { Icon } from "@/components/icons/icons";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { marketingMetadata } from "@/components/marketing/metadata";
import styles from "../marketing.module.css";

export const metadata: Metadata = marketingMetadata({
  title: "Free Career Tools",
  description:
    "Ten free career tools: ATS resume scanner, cover letter writer, job description analyzer, skills matcher, interview prep, salary insights and more.",
  path: "/tools",
});

type Tool = {
  name: string;
  description: string;
  tag: string;
  href: string;
};

type ToolGroup = {
  title: string;
  intro: string;
  tools: Tool[];
};

const groups: ToolGroup[] = [
  {
    title: "Resume and profile",
    intro: "Check, sharpen, and tailor what employers see first.",
    tools: [
      {
        name: "ATS Resume Scanner",
        description: "See whether your CV is machine-readable and aligned with a target job.",
        tag: "Deterministic checks",
        href: "/free-ats-resume-scanner",
      },
      {
        name: "Resume Summary Generator",
        description: "Get three truthful summary options built from your actual background.",
        tag: "3 options",
        href: "/free-resume-summary-generator",
      },
      {
        name: "LinkedIn Headline Builder",
        description: "Turn your real experience into clear headline options.",
        tag: "Grounded in facts",
        href: "/free-linkedin-headline-builder",
      },
    ],
  },
  {
    title: "Applications and interviews",
    intro: "Prepare the documents and answers each role actually asks for.",
    tools: [
      {
        name: "Cover Letter Writer",
        description: "A concise cover letter matched to a real role and your supplied background.",
        tag: "One page",
        href: "/free-cover-letter-writer",
      },
      {
        name: "Interview Question Generator",
        description: "Practice questions and focus notes generated from the actual listing.",
        tag: "Role-specific",
        href: "/free-interview-question-generator",
      },
      {
        name: "Follow-up Email Writer",
        description: "A polite, timely follow-up email without pressure or invented details.",
        tag: "Short and honest",
        href: "/free-follow-up-email-writer",
      },
    ],
  },
  {
    title: "Understanding the role",
    intro: "Read the market clearly before you spend your energy.",
    tools: [
      {
        name: "Job Description Analyzer",
        description: "Break a listing into requirements, responsibilities, keywords, and gaps.",
        tag: "Structured",
        href: "/free-job-description-analyzer",
      },
      {
        name: "Skills Matcher",
        description: "Compare your real skills to a job description with clear strengths and gaps.",
        tag: "Honest gaps",
        href: "/free-skills-matcher",
      },
      {
        name: "Salary Insights",
        description: "Only the pay that your pasted listing explicitly states. Never invented averages.",
        tag: "Stated pay only",
        href: "/free-salary-insights",
      },
      {
        name: "Career Path Explorer",
        description: "Realistic career directions based on the skills you actually have.",
        tag: "Practical next steps",
        href: "/free-career-path-explorer",
      },
    ],
  },
];

function groupId(title: string) {
  return `${title.toLowerCase().replace(/[^a-z]+/g, "-")}-title`;
}

export default async function ToolsPage() {
  const user = await getUser();
const toolItemList = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Free Jobiest career tools',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'ATS Resume Scanner', url: `${SITE_URL}/free-ats-resume-scanner` },
    { '@type': 'ListItem', position: 2, name: 'Resume Summary Generator', url: `${SITE_URL}/free-resume-summary-generator` },
    { '@type': 'ListItem', position: 3, name: 'LinkedIn Headline Builder', url: `${SITE_URL}/free-linkedin-headline-builder` },
    { '@type': 'ListItem', position: 4, name: 'Cover Letter Writer', url: `${SITE_URL}/free-cover-letter-writer` },
    { '@type': 'ListItem', position: 5, name: 'Interview Question Generator', url: `${SITE_URL}/free-interview-question-generator` },
    { '@type': 'ListItem', position: 6, name: 'Follow-up Email Writer', url: `${SITE_URL}/free-follow-up-email-writer` },
    { '@type': 'ListItem', position: 7, name: 'Job Description Analyzer', url: `${SITE_URL}/free-job-description-analyzer` },
    { '@type': 'ListItem', position: 8, name: 'Skills Matcher', url: `${SITE_URL}/free-skills-matcher` },
    { '@type': 'ListItem', position: 9, name: 'Salary Insights', url: `${SITE_URL}/free-salary-insights` },
    { '@type': 'ListItem', position: 10, name: 'Career Path Explorer', url: `${SITE_URL}/free-career-path-explorer` },
  ],
};
  return (
    <MarketingShell activePath="/tools" authenticated={!!user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(toolItemList) }} />
      <main className={styles.page}>
        <header className={styles.pageHero}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Free career tools</p>
            <h1>Ten free tools for the parts that eat your week.</h1>
            <p className={styles.pageLead}>
              Scan your CV, analyze a listing, write a cover letter, or prep an interview. Every tool works from the text you give it, and nothing is invented.
            </p>
          </div>
        </header>

        <section data-animate className={styles.section} aria-labelledby="tool-index-title">
          <div className={styles.container}>
            <h2 id="tool-index-title" className="visually-hidden">All free career tools</h2>
            {groups.map((group) => (
              <section data-animate className={styles.toolGroup} key={group.title} aria-labelledby={groupId(group.title)}>
                <h2 id={groupId(group.title)}>{group.title}</h2>
                <p>{group.intro}</p>
                <div className={styles.toolCards}>
                  {group.tools.map((tool) => (
                    <article className={styles.toolCard} key={tool.name}>
                      <div className={styles.toolCardTop}>
                        <h3>{tool.name}</h3>
                        <span className={styles.toolTag}>{tool.tag}</span>
                      </div>
                      <p>{tool.description}</p>
                      <a className={styles.inlineCta} href={tool.href}>
                        Open tool
                        <Icon name="arrow-up-right" width={17} height={17} />
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section data-animate className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="tool-rules-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>How the tools work</p>
              <h2 id="tool-rules-title">Three rules every tool follows.</h2>
            </div>
            <div className={styles.stepsGrid}>
              <article className={styles.stepCard}>
                <span className={styles.stepNumber}>1</span>
                <h3>Nothing invented</h3>
                <p>Every result is grounded in the job text you paste or the profile facts you provide. Missing facts are flagged, not fabricated.</p>
              </article>
              <article className={styles.stepCard}>
                <span className={styles.stepNumber}>2</span>
                <h3>Free to try</h3>
                <p>Every tool runs without an account. Create a free one only when you want to save results to your dashboard.</p>
              </article>
              <article className={styles.stepCard}>
                <span className={styles.stepNumber}>3</span>
                <h3>No card for tools</h3>
                <p>The career tools are free on every plan. Paid plans are separate from this tool index.</p>
              </article>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
