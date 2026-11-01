/**
 * Jobiest Founding Team & Strategic Partnerships Programme - Domain Catalog
 *
 * Powers the public application & partnership portal at https://jobiest.com/apply
 * and the internal Admin CRM at /admin/programme.
 */

export type ProgrammeTrack = 'JOIN_TEAM' | 'PARTNER' | 'COLLABORATOR';

export type ProgrammeDepartmentCode =
  | 'CONTENT_MEDIA'
  | 'SALES_BD'
  | 'STRATEGY_OPS'
  | 'TECH_PRODUCT'
  | 'COMMUNITY_CS'
  | 'PARTNERSHIPS_EXPANSION'
  | 'EXTERNAL_PARTNER';

export type WorkingArrangement =
  | 'INTERNSHIP'
  | 'VOLUNTEER'
  | 'PART_TIME'
  | 'FREELANCE'
  | 'FULL_TIME'
  | 'STRATEGIC_PARTNERSHIP';

export type PartnerOrganizationType =
  | 'US_COMPANY'
  | 'UK_COMPANY'
  | 'RECRUITMENT_AGENCY'
  | 'UNIVERSITY'
  | 'TECH_COMMUNITY'
  | 'CAREER_ORG'
  | 'HR_CONSULTING'
  | 'MARKETING_AGENCY'
  | 'STARTUP_COMMUNITY'
  | 'TRAINING_CERTIFICATION'
  | 'OTHER';

export type CrmStage =
  | 'NEW'
  | 'UNDER_REVIEW'
  | 'SHORTLISTED'
  | 'DISCOVERY_CALL'
  | 'TRIAL_60_DAY'
  | 'ACCEPTED'
  | 'PARTNERSHIP_ACTIVE'
  | 'ON_HOLD'
  | 'DECLINED'
  | 'ARCHIVED';

export const PROGRAMME_TRACKS: {
  code: ProgrammeTrack;
  slug: 'team' | 'partner' | 'collaborator';
  title: string;
  subtitle: string;
  ctaLabel: string;
}[] = [
  {
    code: 'JOIN_TEAM',
    slug: 'team',
    title: 'Join the Team',
    subtitle: 'Employment, internships, early-career roles, and founding contributor opportunities across six departments.',
    ctaLabel: 'Apply to Join the Team',
  },
  {
    code: 'PARTNER',
    slug: 'partner',
    title: 'Become a Partner',
    subtitle: 'US & UK employers, recruitment agencies, universities, communities, and training institutions.',
    ctaLabel: 'Propose a Partnership',
  },
  {
    code: 'COLLABORATOR',
    slug: 'collaborator',
    title: 'Become a Collaborator',
    subtitle: 'Freelancers, independent specialists, creators, strategists, and project-based contributors.',
    ctaLabel: 'Apply as a Collaborator',
  },
];

export interface DepartmentDefinition {
  code: Exclude<ProgrammeDepartmentCode, 'EXTERNAL_PARTNER'>;
  letter: string;
  name: string;
  goal: string;
  roles: string[];
}

export const PROGRAMME_DEPARTMENTS: DepartmentDefinition[] = [
  {
    code: 'CONTENT_MEDIA',
    letter: 'A',
    name: 'Content, Media & Visibility',
    goal: 'Build brand awareness, online visibility, audience, and community.',
    roles: [
      'Content Creator',
      'Video Editor',
      'Social Media Manager',
      'Graphic Designer',
      'Copywriter',
      'Brand and Communications Strategist',
      'Digital Marketing Specialist',
    ],
  },
  {
    code: 'SALES_BD',
    letter: 'B',
    name: 'Sales & Business Development',
    goal: 'Acquire US and UK employers, close partnerships, and generate revenue.',
    roles: [
      'Business Development Associate',
      'Sales Representative',
      'Lead Generation Specialist',
      'B2B Outreach Specialist',
      'Partnership Acquisition Associate',
      'Sales Strategist',
    ],
  },
  {
    code: 'STRATEGY_OPS',
    letter: 'C',
    name: 'Strategy & Operations',
    goal: 'Develop strategies, identify opportunities, improve execution, and support expansion.',
    roles: [
      'Business Strategist',
      'Growth Strategist',
      'Business Analyst',
      'Project Coordinator',
      'Operations Associate',
      'Market Research Analyst',
    ],
  },
  {
    code: 'TECH_PRODUCT',
    letter: 'D',
    name: 'Technology & Product',
    goal: 'Improve the product, build new features, maintain reliability, and innovate.',
    roles: [
      'Frontend Developer',
      'Backend Developer',
      'AI Automation Engineer',
      'Software Engineering Intern',
      'UI/UX Designer',
      'QA Tester',
      'Product Analyst',
    ],
  },
  {
    code: 'COMMUNITY_CS',
    letter: 'E',
    name: 'Community & Customer Success',
    goal: 'Grow our community, support users, and improve customer retention.',
    roles: [
      'Community Manager',
      'Customer Support Associate',
      'User Engagement Specialist',
      'Talent Community Coordinator',
      'HR and Recruitment Associate',
    ],
  },
  {
    code: 'PARTNERSHIPS_EXPANSION',
    letter: 'F',
    name: 'Partnerships & Expansion',
    goal: 'Establish relationships with companies, universities, recruitment firms, and international organizations.',
    roles: [
      'Strategic Partnership Manager',
      'University Partnership Representative',
      'Employer Relations Associate',
      'International Business Development Representative',
      'Recruitment Partnerships Coordinator',
    ],
  },
];

export interface PriorityRole {
  rank: number;
  role: string;
  department: Exclude<ProgrammeDepartmentCode, 'EXTERNAL_PARTNER'>;
  responsibility: string;
  immediateWave: boolean;
}

export const IMMEDIATE_PRIORITY_ROLES: PriorityRole[] = [
  { rank: 1, role: 'Content Creator', department: 'CONTENT_MEDIA', responsibility: 'Produce engaging career, product, and founder-led content', immediateWave: true },
  { rank: 2, role: 'Video Editor', department: 'CONTENT_MEDIA', responsibility: 'Create short-form and promotional videos across social channels', immediateWave: true },
  { rank: 3, role: 'Social Media / Growth Associate', department: 'CONTENT_MEDIA', responsibility: 'Grow social channels, organic reach, and platform visibility', immediateWave: true },
  { rank: 4, role: 'B2B Outreach Associate', department: 'SALES_BD', responsibility: 'Research and contact US and UK hiring companies', immediateWave: true },
  { rank: 5, role: 'Business Development Associate', department: 'SALES_BD', responsibility: 'Convert qualified employer prospects into documented partnerships', immediateWave: true },
  { rank: 6, role: 'Graphic Designer', department: 'CONTENT_MEDIA', responsibility: 'Create high-trust brand, campaign, and marketing assets', immediateWave: false },
  { rank: 7, role: 'Community Manager', department: 'COMMUNITY_CS', responsibility: 'Grow and engage the 1,000-member structured talent network', immediateWave: false },
  { rank: 8, role: 'Business Strategist', department: 'STRATEGY_OPS', responsibility: 'Research and execute growth and commercialization opportunities', immediateWave: false },
  { rank: 9, role: 'Software Engineering Intern', department: 'TECH_PRODUCT', responsibility: 'Support product development, testing, and reliability', immediateWave: false },
  { rank: 10, role: 'Partnership Associate', department: 'PARTNERSHIPS_EXPANSION', responsibility: 'Develop institutional, university, and employer relationships', immediateWave: false },
];

export const WORKING_ARRANGEMENTS: {
  code: WorkingArrangement;
  label: string;
  description: string;
}[] = [
  { code: 'INTERNSHIP', label: 'Internship', description: 'Practical startup experience, structured mentorship, and real project participation.' },
  { code: 'VOLUNTEER', label: 'Volunteer collaboration', description: 'Defined contribution to selected early-stage growth and community initiatives.' },
  { code: 'PART_TIME', label: 'Part-time', description: 'Defined responsibilities, weekly deliverables, and agreed working hours.' },
  { code: 'FREELANCE', label: 'Freelance', description: 'Project-based professional engagement with clear scope and deliverables.' },
  { code: 'FULL_TIME', label: 'Full-time', description: 'Formal employment opportunities as revenue and business capacity scale.' },
  { code: 'STRATEGIC_PARTNERSHIP', label: 'Strategic partnership', description: 'Structured collaboration between individuals, teams, employers, or institutions.' },
];

export const WHO_CAN_JOIN: string[] = [
  'Experienced professionals',
  'Recent graduates',
  'University students',
  'Internship applicants',
  'Entry-level professionals',
  'Freelancers and independent contributors',
  'Strategic collaborators',
  'Builders looking for practical high-growth startup experience',
];

export const PARTNER_CATEGORIES: {
  code: PartnerOrganizationType;
  label: string;
}[] = [
  { code: 'US_COMPANY', label: 'United States Employer / Hiring Company' },
  { code: 'UK_COMPANY', label: 'United Kingdom Employer / Hiring Company' },
  { code: 'RECRUITMENT_AGENCY', label: 'Recruitment Agency' },
  { code: 'UNIVERSITY', label: 'University or Educational Institution' },
  { code: 'TECH_COMMUNITY', label: 'Technology Community' },
  { code: 'CAREER_ORG', label: 'Career Development Organization' },
  { code: 'HR_CONSULTING', label: 'HR Consulting Firm' },
  { code: 'MARKETING_AGENCY', label: 'Digital Marketing Agency' },
  { code: 'STARTUP_COMMUNITY', label: 'Startup Community / Accelerator' },
  { code: 'TRAINING_CERTIFICATION', label: 'Training & Certification Organization' },
  { code: 'OTHER', label: 'Professional Association / Other Organization' },
];

export const PARTNER_USE_CASES: string[] = [
  'Employer talent discovery & curated candidate shortlists',
  'Pilot hiring campaign (US / UK / Remote roles)',
  'Recruitment agency sourcing collaboration',
  'University graduate talent network & internship programme',
  'Co-marketing & community growth partnership',
  'Skills verification & training collaboration',
  'Technology or ATS ecosystem integration',
];

export const EARLY_STAGE_TEAM_STRUCTURE = [
  { unit: 'Founder & CEO', headcount: 'Leadership', focus: 'Vision · Strategy · Product · Global Partnerships' },
  { unit: 'Growth & Marketing', headcount: '3-4 contributors', focus: 'Content, video, social media, brand visibility, and acquisition' },
  { unit: 'Sales & Partnerships', headcount: '2-3 contributors', focus: 'US/UK employer outreach, discovery calls, and partnership onboarding' },
  { unit: 'Technology & Product', headcount: '2-3 contributors', focus: 'Platform engineering, AI workflows, QA, and reliability' },
  { unit: 'Operations & Community', headcount: '2-3 contributors', focus: 'Talent network quality, customer support, and 60-day execution tracking' },
];

export const CRM_STAGE_LABELS: Record<CrmStage, string> = {
  NEW: 'New Submission',
  UNDER_REVIEW: 'Under Review',
  SHORTLISTED: 'Shortlisted',
  DISCOVERY_CALL: 'Discovery Call / Interview',
  TRIAL_60_DAY: '60-Day Contribution / Pilot',
  ACCEPTED: 'Active Team / Collaborator',
  PARTNERSHIP_ACTIVE: 'Documented Active Partner',
  ON_HOLD: 'On Hold',
  DECLINED: 'Declined',
  ARCHIVED: 'Archived',
};

export const PUBLIC_ANNOUNCEMENT_TEXT = `WE ARE BUILDING JOBIEST. AND WE NEED PEOPLE WHO WANT TO BUILD WITH US.

Jobiest is an emerging AI-powered career and recruitment technology startup with a big ambition: to make finding jobs easier for individuals and finding the right talent easier for businesses.

We are expanding our early-stage team and opening our doors to talented individuals, interns, professionals, collaborators, and strategic partners.

We are particularly interested in people with experience or interest in:
- Content Creation & Video Editing
- Social Media Management & Digital Marketing
- Sales, Business Development & B2B Outreach
- Business Strategy & Graphic Design
- Software Engineering & AI Automation
- Community Management, Partnerships & Customer Success
- Product Development

We are also open to internship opportunities for students and recent graduates who want practical experience working with an early-stage technology startup, as well as partnerships with US/UK companies, universities, recruitment agencies, and communities.

Apply or propose a partnership directly at: https://jobiest.com/apply

Let's build something meaningful together.
JOBIEST - Building the future of careers and global talent.`;
