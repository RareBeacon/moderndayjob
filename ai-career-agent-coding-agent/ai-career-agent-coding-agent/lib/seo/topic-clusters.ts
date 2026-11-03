export interface TopicClusterSpec {
  slug: string;
  title: string;
  shortLabel: string;
  seoTitle: string;
  metaDescription: string;
  lead: string;
  matchTerms: string[];
  featuredToolHref: string;
  featuredToolLabel: string;
  featuredCvExampleSlug: string;
}

export const TOPIC_CLUSTERS: TopicClusterSpec[] = [
  {
    slug: 'ats-optimization',
    title: 'ATS Resume Optimization & Parsing',
    shortLabel: 'ATS Optimization',
    seoTitle: 'ATS Resume Guides: Formatting, Keywords & Parsing | Jobiest',
    metaDescription: 'Practical guides on passing Applicant Tracking Systems honestly: clean headings, parseable dates, and role-aligned keywords without keyword stuffing.',
    lead: 'Learn how applicant tracking systems actually parse CVs and resumes, what breaks two-column files, and how to match real skills to job descriptions.',
    matchTerms: ['ats', 'keyword', 'scanner', 'match score', 'parse'],
    featuredToolHref: '/free-ats-resume-scanner',
    featuredToolLabel: 'Run Free ATS Resume Scanner',
    featuredCvExampleSlug: 'data-analyst',
  },
  {
    slug: 'nigeria-career-guide',
    title: 'Nigeria & Africa Job Search Playbooks',
    shortLabel: 'Nigeria & Africa',
    seoTitle: 'Nigeria CV Format, NYSC & Remote Job Guides | Jobiest',
    metaDescription: 'Step-by-step career guides for Nigerian graduates, NYSC corps members, and professionals targeting top local employers and legitimate global remote roles.',
    lead: 'Actionable playbooks built in Lagos for Nigerian graduates, NYSC corps members, and experienced talent competing locally and globally.',
    matchTerms: ['nigeria', 'nigerians', 'nysc', 'graduate', 'scam'],
    featuredToolHref: '/free-skills-matcher',
    featuredToolLabel: 'Match Your Skills to a Listing',
    featuredCvExampleSlug: 'nysc-corps-member',
  },
  {
    slug: 'cv-and-resume-writing',
    title: 'CV & Resume Writing Fundamentals',
    shortLabel: 'CV & Resume Writing',
    seoTitle: 'How to Write a CV or Resume That Gets Read | Jobiest',
    metaDescription: 'Clear guides on CV vs Resume formats, writing truthful impact bullets, structuring career summaries, and choosing the right ISO A4 template.',
    lead: 'Everything you need to structure a clean 1-page Resume or full Curriculum Vitae (CV) from verified experience without clichés.',
    matchTerms: ['cv', 'resume', 'summary', 'template', 'entry-level'],
    featuredToolHref: '/free-resume-summary-generator',
    featuredToolLabel: 'Generate Truthful Resume Summaries',
    featuredCvExampleSlug: 'software-engineer',
  },
  {
    slug: 'cover-letters-and-outreach',
    title: 'Cover Letters & Application Follow-Ups',
    shortLabel: 'Cover Letters',
    seoTitle: 'Cover Letter & Post-Application Follow-Up Guides | Jobiest',
    metaDescription: 'Write concise, role-specific cover letters and polite application follow-up emails grounded in real experience rather than generic templates.',
    lead: 'Turn your verified background and a real job listing into clear cover letters and respectful recruiter follow-ups.',
    matchTerms: ['cover letter', 'follow-up', 'linkedin', 'headline', 'about'],
    featuredToolHref: '/free-cover-letter-writer',
    featuredToolLabel: 'Open Free Cover Letter Writer',
    featuredCvExampleSlug: 'product-manager',
  },
  {
    slug: 'interview-preparation',
    title: 'Interview Questions & STAR Preparation',
    shortLabel: 'Interview Prep',
    seoTitle: 'Interview Preparation & STAR Method Guides | Jobiest',
    metaDescription: 'Prepare for behavioral, technical, and competency interviews using real job descriptions and structured STAR examples from your own work.',
    lead: 'Move from application anxiety to structured interview rehearsal using questions mapped directly to the listing requirements.',
    matchTerms: ['interview', 'star', 'callbacks'],
    featuredToolHref: '/free-interview-question-generator',
    featuredToolLabel: 'Generate Practice Interview Questions',
    featuredCvExampleSlug: 'business-analyst',
  },
  {
    slug: 'salary-and-career-growth',
    title: 'Salary Negotiation & Career Transitions',
    shortLabel: 'Salary & Career Growth',
    seoTitle: 'Salary Insights, Negotiation & Career Change Guides | Jobiest',
    metaDescription: 'Evaluate compensation ranges honestly, prepare for salary conversations, and plan realistic skill transitions into adjacent career tracks.',
    lead: 'Practical frameworks for salary research, career pivots, and skill gap analysis.',
    matchTerms: ['salary', 'negotiation', 'career change', 'career path', 'career planning', 'assessment', 'skills'],
    featuredToolHref: '/free-salary-insights',
    featuredToolLabel: 'Explore Free Salary Insights',
    featuredCvExampleSlug: 'financial-analyst',
  },
  {
    slug: 'job-search-systems',
    title: 'Job Search Systems & Approval Automation',
    shortLabel: 'Search Systems',
    seoTitle: 'Job Search Strategy, Tracking & Approval-First Automation | Jobiest',
    metaDescription: 'Build a sustainable weekly job search workflow: source verified roles, tailor materials fast, and keep 100% human approval before applying.',
    lead: 'Replace Sunday-night burnout with a repeatable system for sourcing roles, tailoring documents, and tracking applications.',
    matchTerms: ['automation', 'agent', 'taking so long', '20-jobs', 'checklist', 'tools'],
    featuredToolHref: '/free-job-description-analyzer',
    featuredToolLabel: 'Analyze a Job Description Free',
    featuredCvExampleSlug: 'project-manager',
  },
  {
    slug: 'remote-work-africa',
    title: 'Remote Work & Global Hiring',
    shortLabel: 'Remote Work',
    seoTitle: 'Finding Legitimate Remote Jobs from Nigeria & Africa | Jobiest',
    metaDescription: 'How to identify legitimate remote employers hiring in EMEA and African timezones, avoid fake job scams, and present global-ready CVs.',
    lead: 'Navigate timezone requirements, employer verification, and international resume expectations when applying for remote work.',
    matchTerms: ['remote', 'online jobs', 'international', 'global'],
    featuredToolHref: '/free-ats-resume-scanner',
    featuredToolLabel: 'Scan Your Remote Resume Free',
    featuredCvExampleSlug: 'customer-success-specialist',
  },
];

export function getTopicCluster(slug: string): TopicClusterSpec | null {
  return TOPIC_CLUSTERS.find((c) => c.slug === slug) ?? null;
}

export function matchPostToCluster(input: { slug: string; title: string; keyword?: string | null; cluster?: string | null }): TopicClusterSpec {
  const hay = [input.slug.replace(/-/g, ' '), input.title, input.keyword, input.cluster]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const cluster of TOPIC_CLUSTERS) {
    if (cluster.matchTerms.some((term) => hay.includes(term.toLowerCase()))) {
      return cluster;
    }
  }
  return TOPIC_CLUSTERS[2];
}
