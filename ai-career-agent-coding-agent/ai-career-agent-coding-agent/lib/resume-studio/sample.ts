import type { StudioDraft } from './draft';

/**
 * Preview-only sample resume fixture used strictly by the public /templates
 * Resume Library gallery and template modal previews (never persisted into
 * user drafts, career profiles, or generated exports).
 */
export const SAMPLE_PREVIEW_DRAFT: StudioDraft = {
  versionName: 'Alex Morgan Preview',
  selectedTemplate: 'tpl-03-modern-professional',
  currentStep: 'templates',
  personal: {
    name: 'Alex Morgan',
    email: 'alex.morgan.test@jobiest-qa.example',
    phone: '+44 7700 900123',
    location: 'London, United Kingdom',
    website: 'alexmorgan.dev',
    linkedin: 'linkedin.com/in/alex-morgan-profile',
    github: 'github.com/alexmorgan-dev',
    photoDataUrl: '',
  },
  career: {
    headline: 'Senior Software Engineer & AI Automation Specialist',
    targetRole: 'Senior Software Engineer',
    yearsExperience: '7+',
    seniority: 'senior',
    summary:
      'Senior Software Engineer with 7+ years of experience designing scalable web platforms, automation workflows, and data-driven digital products across fintech, SaaS, and enterprise technology environments. Proven record of improving system reliability, reducing operational overhead, and leading cross-functional engineering delivery.',
  },
  skills: [
    { name: 'TypeScript', category: 'Languages', priority: 1 },
    { name: 'Python', category: 'Languages', priority: 2 },
    { name: 'SQL', category: 'Languages', priority: 3 },
    { name: 'React', category: 'Frameworks & APIs', priority: 4 },
    { name: 'Next.js', category: 'Frameworks & APIs', priority: 5 },
    { name: 'Node.js', category: 'Frameworks & APIs', priority: 6 },
    { name: 'REST APIs', category: 'Frameworks & APIs', priority: 7 },
    { name: 'GraphQL', category: 'Frameworks & APIs', priority: 8 },
    { name: 'PostgreSQL', category: 'Cloud, Data & DevOps', priority: 9 },
    { name: 'Docker', category: 'Cloud, Data & DevOps', priority: 10 },
    { name: 'AWS', category: 'Cloud, Data & DevOps', priority: 11 },
    { name: 'CI/CD', category: 'Cloud, Data & DevOps', priority: 12 },
    { name: 'AI Workflow Automation', category: 'AI, Data & Automation', priority: 13 },
    { name: 'Product Analytics', category: 'AI, Data & Automation', priority: 14 },
  ],
  experiences: [
    {
      id: 'sample-exp-1',
      company: 'NovaTech Solutions',
      role: 'Senior Software Engineer',
      location: 'London, UK',
      startDate: 'Jan 2023',
      endDate: 'Present',
      current: true,
      roughNotes: '',
      tools: ['TypeScript', 'Next.js', 'Python', 'PostgreSQL', 'AWS'],
      impact: 'Reduced p95 latency by 38% and manual operations by 52%.',
      bullets: [
        'Architected multi-tenant customer workflow services handling over 1.2M monthly requests with 99.95% uptime.',
        'Reduced API response latency by 38% by redesigning database indexing, caching strategies, and background job queues.',
        'Built internal AI-assisted support and document triage tools that cut manual operations review time by 52%.',
        'Mentored 5 mid-level and junior engineers, introducing code review standards and automated release checks.',
      ],
    },
    {
      id: 'sample-exp-2',
      company: 'Bright Systems Ltd',
      role: 'Full-Stack Software Engineer',
      location: 'Manchester, UK',
      startDate: 'Mar 2020',
      endDate: 'Dec 2022',
      current: false,
      roughNotes: '',
      tools: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'CI/CD'],
      impact: 'Served 45,000+ active users and cut deployment incidents by 44%.',
      bullets: [
        'Developed React, TypeScript, and Node.js applications for B2B analytics clients across 45,000+ active users.',
        'Built automated billing, reporting, and onboarding workflows that decreased customer setup time from 5 days to under 6 hours.',
        'Partnered with product and UX teams to launch self-serve analytics dashboards, increasing feature adoption by 29%.',
        'Improved test coverage from 41% to 84%, reducing post-release defects by 44%.',
      ],
    },
    {
      id: 'sample-exp-3',
      company: 'Digital Bridge',
      role: 'Junior Software Developer',
      location: 'Birmingham, UK',
      startDate: 'Jul 2018',
      endDate: 'Feb 2020',
      current: false,
      roughNotes: '',
      tools: ['JavaScript', 'SQL', 'REST APIs'],
      impact: 'Maintained client portals across 18 SME customers.',
      bullets: [
        'Implemented responsive web interfaces and REST API integrations for client portals across 18 SME accounts.',
        'Automated recurring data imports and QA checks, saving approximately 12 engineering hours per week.',
        'Collaborated in agile sprints, contributing bug fixes, technical documentation, and production support.',
      ],
    },
  ],
  education: [
    {
      id: 'sample-edu-1',
      institution: 'University of Manchester',
      degree: 'BSc (Hons)',
      field: 'Computer Science',
      startDate: 'Sep 2014',
      endDate: 'Jun 2018',
      achievements: 'First-Class Honours; Final-Year Project in Distributed Event Processing.',
    },
  ],
  projects: [
    {
      id: 'sample-proj-1',
      name: 'AI Workflow Automation Platform',
      description:
        'Designed a modular event-driven automation toolkit connecting webhooks, LLM classification pipelines, and audit logs for operations teams.',
      technologies: ['Python', 'TypeScript', 'PostgreSQL', 'Docker'],
      url: 'github.com/alexmorgan-dev/workflow-platform',
      achievements: ['Processed 250k+ automated workflow events with full audit traceability.'],
    },
    {
      id: 'sample-proj-2',
      name: 'Intelligent Career Matching Engine',
      description:
        'Built a structured skill-extraction and role-scoring service evaluating candidate fit with explainable criteria.',
      technologies: ['Next.js', 'Node.js', 'SQL', 'GraphQL'],
      url: 'alexmorgan.dev/projects/career-matching',
      achievements: ['Cut candidate-role screening latency to under 180ms per evaluation.'],
    },
  ],
  certifications: [
    {
      id: 'sample-cert-1',
      name: 'AWS Certified Solutions Architect - Associate',
      issuer: 'Amazon Web Services',
      date: '2024',
    },
    {
      id: 'sample-cert-2',
      name: 'Google Professional Data Engineer',
      issuer: 'Google Cloud',
      date: '2023',
    },
  ],
  languages: [
    { language: 'English', proficiency: 'Native' },
    { language: 'French', proficiency: 'Conversational' },
  ],
  publications: [],
  volunteer: [],
  memberships: [],
  achievements: [],
  references: '',
  additional: 'Languages: English (Native), French (Conversational).',
  targetJobDescription: '',
};
