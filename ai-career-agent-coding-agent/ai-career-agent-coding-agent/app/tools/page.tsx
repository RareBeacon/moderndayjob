import type { Metadata } from 'next';
import Link from 'next/link';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { SITE_URL } from '@/lib/site';
import { jsonLdTag } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Free Career Tools',
  description:
    'Ten free career tools from Jobiest: ATS resume scanner, cover letter writer, job description analyzer, skills matcher, interview prep, salary insights and more. No card required.',
  alternates: { canonical: `${SITE_URL}/tools` },
  openGraph: {
    title: 'Free Career Tools · Jobiest',
    description: 'Ten free career tools: scan your CV, write cover letters, analyze job descriptions, and prepare interviews. No card required.',
    images: ['/images/og-card.jpg'],
  },
};

const GROUPS: { title: string; blurb: string; tools: { name: string; href: string; outcome: string; note: string }[] }[] = [
  {
    title: 'Resume and profile',
    blurb: 'Check, sharpen, and tailor what employers see first.',
    tools: [
      { name: 'ATS Resume Scanner', href: '/free-ats-resume-scanner', outcome: 'See whether your CV is machine-readable and aligned with a target job.', note: 'Deterministic checks' },
      { name: 'Resume Summary Generator', href: '/free-resume-summary-generator', outcome: 'Get three truthful summary options built from your actual background.', note: '3 options' },
      { name: 'LinkedIn Headline Builder', href: '/free-linkedin-headline-builder', outcome: 'Turn your real experience into clear headline options.', note: 'Grounded in facts' },
    ],
  },
  {
    title: 'Applications and interviews',
    blurb: 'Prepare the documents and answers each role actually asks for.',
    tools: [
      { name: 'Cover Letter Writer', href: '/free-cover-letter-writer', outcome: 'A concise cover letter matched to a real role and your supplied background.', note: 'One page' },
      { name: 'Interview Question Generator', href: '/free-interview-question-generator', outcome: 'Practice questions and focus notes generated from the actual listing.', note: 'Role-specific' },
      { name: 'Follow-up Email Writer', href: '/free-follow-up-email-writer', outcome: 'A polite, timely follow-up email without pressure or invented details.', note: 'Short and honest' },
    ],
  },
  {
    title: 'Understanding the role',
    blurb: 'Read the market clearly before you spend your energy.',
    tools: [
      { name: 'Job Description Analyzer', href: '/free-job-description-analyzer', outcome: 'Break a listing into requirements, responsibilities, keywords and gaps.', note: 'Structured' },
      { name: 'Skills Matcher', href: '/free-skills-matcher', outcome: 'Compare your real skills to a job description with clear strengths and gaps.', note: 'Honest gaps' },
      { name: 'Salary Insights', href: '/free-salary-insights', outcome: 'Only the pay that your pasted listing explicitly states. Never invented averages.', note: 'Stated pay only' },
      { name: 'Career Path Explorer', href: '/free-career-path-explorer', outcome: 'Realistic career directions based on the skills you actually have.', note: 'Practical next steps' },
    ],
  },
];

const RULES = [
  { title: 'Nothing invented', body: 'Every result is grounded in the job text you paste or the profile facts you provide. Missing facts are flagged, not fabricated.' },
  { title: 'Free to try', body: 'Every tool runs without an account. Create a free one only when you want to save results to your dashboard.' },
  { title: 'No card, ever, for tools', body: 'The career tools are free on every plan. Paid plans add daily AI generation volume and agent mode.' },
];

export default function ToolsHubPage() {
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Free Jobiest career tools',
    itemListElement: GROUPS.flatMap((g) => g.tools).map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      url: `${SITE_URL}${t.href}`,
    })),
  };
  return (
    <div className="jl-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(itemList)} />
      <JobletNavbar />
      <main id="main">
        <section className="jl-sec blog-hero">
          <div className="jl-shell">
            <span className="jl-kicker">Free career tools</span>
            <h1>Ten free tools for the parts that eat your week.</h1>
            <p>Scan your CV, analyze a listing, write a cover letter, or prep an interview. Every tool works from the text you give it, and nothing is invented.</p>
          </div>
        </section>

        {GROUPS.map((group) => (
          <section className="jl-sec" key={group.title}>
            <div className="jl-shell">
              <div className="jl-sec-head">
                <h2>{group.title}</h2>
                <p>{group.blurb}</p>
              </div>
              <div className="jl-tools-grid">
                {group.tools.map((tool) => (
                  <Link className="jl-tool" href={tool.href} key={tool.href}>
                    <span className="jl-tool-tag">{tool.note}</span>
                    <h3>{tool.name}</h3>
                    <p>{tool.outcome}</p>
                    <span className="jl-tool-go">Open tool
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="14" height="14">
                        <path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="jl-sec tint">
          <div className="jl-shell">
            <div className="jl-sec-head center">
              <span className="jl-kicker">How the tools work</span>
              <h2>Three rules every tool follows.</h2>
            </div>
            <div className="jl-how">
              {RULES.map((rule) => (
                <article className="jl-how-step" key={rule.title}>
                  <h3>{rule.title}</h3>
                  <p>{rule.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="jl-sec">
          <div className="jl-shell pastor-response">
            <span className="jl-kicker">When you want more</span>
            <h2>Let the agent do the repetitive part.</h2>
            <p>Jobiest finds roles that fit your profile, prepares applications from your verified facts, and waits for your approval before anything sends.</p>
            <Link className="jl-btn-solid" href="/signup">Start free</Link>
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
