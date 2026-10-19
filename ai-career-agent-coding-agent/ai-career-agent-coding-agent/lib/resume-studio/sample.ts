import type { StudioDraft } from './draft';

/** Public preview fixture only. Never use this object to initialize or save a user's draft. */
export const SAMPLE_PREVIEW_DRAFT: StudioDraft = {
  versionName: 'Fictional sample',
  selectedTemplate: 'modern-tech',
  currentStep: 'templates',
  personal: {
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    phone: '+1 202 555 0148',
    location: 'Chicago, IL',
    website: 'alex.example.com',
    linkedin: '',
    github: '',
    photoDataUrl: '',
  },
  career: {
    headline: 'Operations Analyst',
    targetRole: 'Operations Analyst',
    yearsExperience: '5',
    seniority: 'mid',
    summary: 'Operations analyst focused on clearer reporting and smoother team workflows. Brings data, communication and practical problem-solving together to help teams make better decisions.',
  },
  experiences: [
    {
      id: 'sample-exp-1', company: 'Northstar Labs', role: 'Operations Analyst',
      location: 'Chicago, IL', startDate: '2022', endDate: '', current: true,
      roughNotes: '', tools: ['SQL', 'Sheets'], impact: '',
      bullets: [
        'Built weekly reporting that gave teams a consistent view of service trends.',
        'Worked with support and product teams to simplify hand-offs and follow-up.',
      ],
    },
    {
      id: 'sample-exp-2', company: 'Cedar Works', role: 'Operations Coordinator',
      location: 'Chicago, IL', startDate: '2019', endDate: '2022', current: false,
      roughNotes: '', tools: ['Excel'], impact: '',
      bullets: ['Organized project updates and documented repeatable team processes.'],
    },
  ],
  skills: [
    { name: 'Process improvement', category: 'Operations', priority: 1 },
    { name: 'Data reporting', category: 'Analysis', priority: 2 },
    { name: 'SQL', category: 'Analysis', priority: 3 },
    { name: 'Stakeholder communication', category: 'Operations', priority: 4 },
    { name: 'Excel', category: 'Tools', priority: 5 },
  ],
  education: [
    {
      id: 'sample-edu-1', institution: 'Lakeview University',
      degree: 'BSc', field: 'Business Administration', startDate: '2015', endDate: '2019',
    },
  ],
  projects: [
    {
      id: 'sample-project-1', name: 'Service Insights Dashboard',
      description: 'A reporting view that brought service metrics into one weekly review.',
      technologies: ['SQL', 'Sheets'], achievements: [],
    },
  ],
  certifications: [{ id: 'sample-cert-1', name: 'Process Improvement Foundations', issuer: 'Learning Institute', date: '2021' }],
  achievements: [],
  references: '',
  additional: '',
  targetJobDescription: '',
};
