export type FreeToolId =
  | 'ats-resume-scanner'
  | 'cover-letter-writer'
  | 'job-description-analyzer'
  | 'skills-matcher'
  | 'interview-question-generator'
  | 'resume-summary-generator'
  | 'linkedin-headline-builder'
  | 'follow-up-email-writer'
  | 'career-path-explorer'
  | 'salary-insights';

export type FreeToolQuestionType = 'text' | 'textarea' | 'number' | 'select' | 'chips';

export interface FreeToolQuestion {
  id: string;
  label: string;
  assistant: string;
  why?: string;
  type: FreeToolQuestionType;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  options?: string[];
  suggestions?: string[];
  followUps?: { when: 'short' | 'missing' | 'always'; message: string; suggestions?: string[] }[];
}

export interface FreeToolConfig {
  id: FreeToolId;
  name: string;
  route: string;
  category: 'resume' | 'application' | 'job-intelligence' | 'career' | 'salary';
  description: string;
  introTitle: string;
  intro: string;
  questions: FreeToolQuestion[];
  outputType: 'letter' | 'analysis' | 'questions' | 'options' | 'email' | 'paths' | 'salary' | 'scan' | 'matches';
  generationLabel: string;
  progressMessages: string[];
  supportsCopy: boolean;
  supportsDownload: boolean;
  supportsSave: boolean;
  requiresAuthenticationToUnlock: true;
  nextSteps: { label: string; href: string }[];
}

const roleSuggestions = ['AI Engineer', 'Software Engineer', 'Data Analyst', 'Product Manager', 'Customer Success Manager', 'Marketing Manager'];
const skillSuggestions = ['Python', 'AI Agents', 'APIs', 'Automation', 'React', 'SQL', 'Data Analysis', 'Project Management', 'Customer Support', 'SEO'];

export const FREE_TOOLS: FreeToolConfig[] = [
  {
    id: 'ats-resume-scanner',
    name: 'ATS Resume Scanner',
    route: '/free-ats-resume-scanner',
    category: 'resume',
    description: 'Check whether your CV is machine-readable and aligned with a target job.',
    introTitle: 'Let us check how your resume reads to an ATS.',
    intro: 'Paste your resume text first. If you have a job description, add it so we can check keyword overlap. The result is a preview until you create or sign into a free account.',
    outputType: 'scan',
    generationLabel: 'Scan my resume',
    progressMessages: ['Reading your resume structure', 'Checking contact details and headings', 'Comparing job keywords', 'Building your action list'],
    supportsCopy: true,
    supportsDownload: true,
    supportsSave: true,
    requiresAuthenticationToUnlock: true,
    nextSteps: [{ label: 'Build my resume', href: '/generate' }, { label: 'Analyze a job description', href: '/free-job-description-analyzer' }, { label: 'Find matching jobs', href: '/jobs' }],
    questions: [
      { id: 'resumeText', label: 'Paste your resume text', assistant: 'Paste the full text of your CV. Headings, roles, dates, bullets, everything helps.', type: 'textarea', required: true, minLength: 100, placeholder: 'Paste your CV text here...' },
      { id: 'targetRole', label: 'What role is this resume targeting?', assistant: 'This helps the scanner judge whether the resume is focused.', type: 'text', required: false, placeholder: 'AI Engineer', suggestions: roleSuggestions },
      { id: 'jobDescription', label: 'Paste the job description, optional', assistant: 'If you add the listing, I can compare its keywords against your resume.', type: 'textarea', required: false, minLength: 30, placeholder: 'Paste the job description here...' },
    ],
  },
  {
    id: 'cover-letter-writer',
    name: 'Cover Letter Writer',
    route: '/free-cover-letter-writer',
    category: 'application',
    description: 'Create a concise cover letter matched to a real role and your supplied background.',
    introTitle: 'Let us create a cover letter that actually matches the job.',
    intro: 'I will ask for the role, job description, your background, motivation and a highlight. If something is missing, I will ask instead of writing generic filler.',
    outputType: 'letter',
    generationLabel: 'Generate cover letter',
    progressMessages: ['Understanding the role', 'Extracting job keywords', 'Matching your background', 'Writing a concise draft', 'Removing generic wording'],
    supportsCopy: true,
    supportsDownload: true,
    supportsSave: true,
    requiresAuthenticationToUnlock: true,
    nextSteps: [{ label: 'Build my resume', href: '/generate' }, { label: 'Check my resume', href: '/free-ats-resume-scanner' }, { label: 'Find jobs that match me', href: '/jobs' }],
    questions: [
      { id: 'targetRole', label: 'What role are you applying for?', assistant: 'First things first. What role should this letter target?', type: 'text', required: true, minLength: 2, placeholder: 'AI Engineer', suggestions: roleSuggestions },
      { id: 'company', label: 'What is the company name?', assistant: 'Add the company if you know it. If not, leave it blank and I will avoid pretending.', type: 'text', required: false, placeholder: 'ABC Technologies' },
      { id: 'jobDescription', label: 'Paste the job description', assistant: 'Paste the listing here. Long is fine. I will extract the useful parts.', type: 'textarea', required: true, minLength: 30, placeholder: 'Paste the job description...' },
      { id: 'background', label: 'Tell me briefly about your experience', assistant: 'Use normal language. What have you done that relates to this role?', type: 'textarea', required: true, minLength: 20, placeholder: 'I have 3 years of experience building AI agents and automation systems.', followUps: [{ when: 'short', message: 'That is a start. What did you actually build, support, manage or improve?' }] },
      { id: 'skills', label: 'Which relevant skills should I use?', assistant: 'Select or add only skills you genuinely have.', type: 'chips', required: true, suggestions: skillSuggestions },
      { id: 'motivation', label: 'Why are you interested in this role?', assistant: 'One honest reason is enough. I will keep it professional.', type: 'textarea', required: false, placeholder: 'I like the company focus on intelligent automation.' },
      { id: 'achievement', label: 'One project or achievement to highlight', assistant: 'Only include something true. If you have no metric, do not invent one.', type: 'textarea', required: false, placeholder: 'I built a customer support automation that reduced repetitive work.' },
      { id: 'tone', label: 'Choose the tone', assistant: 'Pick the tone that feels closest to you.', type: 'select', required: true, options: ['Professional', 'Confident', 'Warm', 'Concise', 'Enthusiastic'] },
    ],
  },
  {
    id: 'job-description-analyzer', name: 'Job Description Analyzer', route: '/free-job-description-analyzer', category: 'job-intelligence', description: 'Break a listing into requirements, responsibilities, keywords and gaps.', introTitle: 'Let us understand the job before you apply.', intro: 'Paste a real job description. Add your skills if you want a personalized gap check.', outputType: 'analysis', generationLabel: 'Analyze job description', progressMessages: ['Reading the listing', 'Extracting required skills', 'Finding responsibilities', 'Checking your skill overlap'], supportsCopy: true, supportsDownload: true, supportsSave: true, requiresAuthenticationToUnlock: true, nextSteps: [{ label: 'Write a cover letter', href: '/free-cover-letter-writer' }, { label: 'Match my skills', href: '/free-skills-matcher' }, { label: 'Practice interviews', href: '/free-interview-question-generator' }], questions: [
      { id: 'jobDescription', label: 'Paste the job description', assistant: 'Paste the listing. I will only extract what it actually states.', type: 'textarea', required: true, minLength: 30, placeholder: 'Paste the job description...' },
      { id: 'targetRole', label: 'What role name should I compare against?', assistant: 'If the title is unclear, tell me the role you think this is.', type: 'text', required: false, suggestions: roleSuggestions },
      { id: 'skills', label: 'Your relevant skills, optional', assistant: 'Add skills you actually have and I will mark matches and gaps.', type: 'chips', required: false, suggestions: skillSuggestions },
    ] },
  {
    id: 'skills-matcher', name: 'Skills Matcher', route: '/free-skills-matcher', category: 'job-intelligence', description: 'Compare your real skills to a job description with clear strengths and gaps.', introTitle: 'Let us see how your skills match the role.', intro: 'Add the job description and the skills you actually have. I will explain matches, gaps and what to emphasize.', outputType: 'matches', generationLabel: 'Match my skills', progressMessages: ['Extracting job requirements', 'Reading your skills', 'Finding strengths', 'Finding honest gaps'], supportsCopy: true, supportsDownload: true, supportsSave: true, requiresAuthenticationToUnlock: true, nextSteps: [{ label: 'Improve my resume', href: '/generate' }, { label: 'Analyze another job', href: '/free-job-description-analyzer' }, { label: 'Write a cover letter', href: '/free-cover-letter-writer' }], questions: [
      { id: 'targetRole', label: 'What role are you targeting?', assistant: 'This keeps the match focused.', type: 'text', required: true, minLength: 2, suggestions: roleSuggestions },
      { id: 'skills', label: 'Which skills do you actually have?', assistant: 'Select or add your real skills. Suggestions are not claims until you choose them.', type: 'chips', required: true, suggestions: skillSuggestions },
      { id: 'jobDescription', label: 'Paste the job description', assistant: 'Paste the listing so I can compare against its stated requirements.', type: 'textarea', required: true, minLength: 30 },
      { id: 'experience', label: 'Briefly describe relevant experience, optional', assistant: 'This helps me explain the match in human language.', type: 'textarea', required: false },
    ] },
  {
    id: 'interview-question-generator', name: 'Interview Question Generator', route: '/free-interview-question-generator', category: 'application', description: 'Generate interview questions, focus notes and preparation prompts from a real listing.', introTitle: 'Let us prepare for the interview you actually want.', intro: 'I will use the job description, role and your background to create practical questions. No generic list.', outputType: 'questions', generationLabel: 'Generate interview prep', progressMessages: ['Reading the role', 'Finding likely interview themes', 'Writing questions', 'Adding preparation notes'], supportsCopy: true, supportsDownload: true, supportsSave: true, requiresAuthenticationToUnlock: true, nextSteps: [{ label: 'Analyze the job', href: '/free-job-description-analyzer' }, { label: 'Tailor my resume', href: '/generate' }, { label: 'Write follow-up email', href: '/free-follow-up-email-writer' }], questions: [
      { id: 'targetRole', label: 'What role is this interview for?', assistant: 'Add the role so the prep is focused.', type: 'text', required: true, minLength: 2, suggestions: roleSuggestions },
      { id: 'jobDescription', label: 'Paste the job description', assistant: 'The questions should come from the real listing, not a random template.', type: 'textarea', required: true, minLength: 30 },
      { id: 'experience', label: 'What experience should your answers lean on?', assistant: 'Give me the rough version. I will turn it into prep notes without inventing anything.', type: 'textarea', required: false },
      { id: 'focus', label: 'What do you want to practice?', assistant: 'Pick what matters most for this interview.', type: 'chips', required: false, suggestions: ['Technical', 'Behavioral', 'Leadership', 'Projects', 'Salary', 'Weak areas'] },
    ] },
  {
    id: 'resume-summary-generator', name: 'Resume Summary Generator', route: '/free-resume-summary-generator', category: 'resume', description: 'Create three truthful resume summary options from your actual background.', introTitle: 'Let us write the top of your resume clearly.', intro: 'Tell me your target role, experience, real skills and one proof point. I will give you three options without clichés.', outputType: 'options', generationLabel: 'Generate summaries', progressMessages: ['Reading your background', 'Selecting the strongest facts', 'Writing three options', 'Checking for clichés'], supportsCopy: true, supportsDownload: true, supportsSave: true, requiresAuthenticationToUnlock: true, nextSteps: [{ label: 'Open Resume Studio', href: '/generate' }, { label: 'Scan my resume', href: '/free-ats-resume-scanner' }, { label: 'Build LinkedIn headline', href: '/free-linkedin-headline-builder' }], questions: [
      { id: 'targetRole', label: 'What role should the summary target?', assistant: 'A strong summary needs a clear direction.', type: 'text', required: true, minLength: 2, suggestions: roleSuggestions },
      { id: 'experienceLevel', label: 'How experienced are you?', assistant: 'I will keep the wording realistic for your level.', type: 'select', required: true, options: ['Student or graduate', '1 to 2 years', '2 to 5 years', '5+ years', 'Executive'] },
      { id: 'background', label: 'What should employers know about you?', assistant: 'Plain language is fine. Mention real work, projects or education.', type: 'textarea', required: true, minLength: 20 },
      { id: 'skills', label: 'Relevant skills', assistant: 'Choose skills that are true for you.', type: 'chips', required: true, suggestions: skillSuggestions },
      { id: 'achievement', label: 'One proof point, optional', assistant: 'Use a real project, responsibility or metric. If there is no number, leave numbers out.', type: 'textarea', required: false },
    ] },
  {
    id: 'linkedin-headline-builder', name: 'LinkedIn Headline Builder', route: '/free-linkedin-headline-builder', category: 'resume', description: 'Create honest LinkedIn headline options that match your role and skills.', introTitle: 'Let us make your LinkedIn headline specific.', intro: 'No vague hype. Tell me your role, skills and what you want to be known for.', outputType: 'options', generationLabel: 'Generate headlines', progressMessages: ['Reading your role', 'Grouping your skills', 'Writing headline options', 'Removing buzzwords'], supportsCopy: true, supportsDownload: true, supportsSave: true, requiresAuthenticationToUnlock: true, nextSteps: [{ label: 'Write resume summary', href: '/free-resume-summary-generator' }, { label: 'Build my resume', href: '/generate' }, { label: 'Explore Jobiest', href: '/dashboard' }], questions: [
      { id: 'targetRole', label: 'What role should your headline point to?', assistant: 'A focused headline works better than a vague one.', type: 'text', required: true, suggestions: roleSuggestions },
      { id: 'skills', label: 'Pick your strongest skills', assistant: 'Choose skills you can confidently discuss.', type: 'chips', required: true, suggestions: skillSuggestions },
      { id: 'experience', label: 'Brief experience note, optional', assistant: 'Add years or context only if it is true.', type: 'text', required: false, placeholder: '3 years building automation systems' },
      { id: 'uniqueValue', label: 'What do you want to be known for?', assistant: 'For example: AI automation, customer support systems, growth analytics.', type: 'text', required: false },
    ] },
  {
    id: 'follow-up-email-writer', name: 'Follow-up Email Writer', route: '/free-follow-up-email-writer', category: 'application', description: 'Write a polite follow-up email based on the role, company and timing.', introTitle: 'Let us write a follow-up that feels polite and clear.', intro: 'Add the company, role and timing. I will write a short email without pressure or invented details.', outputType: 'email', generationLabel: 'Generate follow-up email', progressMessages: ['Checking the timing', 'Writing a polite subject', 'Keeping the tone light', 'Polishing the message'], supportsCopy: true, supportsDownload: true, supportsSave: true, requiresAuthenticationToUnlock: true, nextSteps: [{ label: 'Track applications', href: '/dashboard' }, { label: 'Find matching jobs', href: '/jobs' }, { label: 'Prepare interview questions', href: '/free-interview-question-generator' }], questions: [
      { id: 'company', label: 'What company did you apply to?', assistant: 'Company name helps the email feel real.', type: 'text', required: true, minLength: 2 },
      { id: 'targetRole', label: 'What role did you apply for?', assistant: 'Add the exact role if you know it.', type: 'text', required: true, minLength: 2, suggestions: roleSuggestions },
      { id: 'daysSinceApplied', label: 'How many days ago did you apply?', assistant: 'This keeps the tone appropriate.', type: 'number', required: true, placeholder: '7' },
      { id: 'contactName', label: 'Recruiter or contact name, optional', assistant: 'Leave blank if you do not know. I will not invent one.', type: 'text', required: false },
      { id: 'note', label: 'Anything specific to mention?', assistant: 'For example, an interview, referral or document you sent. Only add what happened.', type: 'textarea', required: false },
    ] },
  {
    id: 'career-path-explorer', name: 'Career Path Explorer', route: '/free-career-path-explorer', category: 'career', description: 'Explore realistic career directions based on your actual skills and interests.', introTitle: 'Let us map career paths from what you already have.', intro: 'Tell me your current role, skills and interests. I will suggest directions, what they build on, and what to learn next.', outputType: 'paths', generationLabel: 'Explore career paths', progressMessages: ['Reading your current skills', 'Finding adjacent paths', 'Checking realism', 'Writing next steps'], supportsCopy: true, supportsDownload: true, supportsSave: true, requiresAuthenticationToUnlock: true, nextSteps: [{ label: 'Build my resume', href: '/generate' }, { label: 'Find jobs', href: '/jobs' }, { label: 'Check salary signals', href: '/free-salary-insights' }], questions: [
      { id: 'currentRole', label: 'What do you currently do?', assistant: 'Student, freelancer, support rep, engineer, analyst, anything is fine.', type: 'text', required: true, minLength: 2 },
      { id: 'skills', label: 'What skills do you already have?', assistant: 'The paths must build on real skills, not fantasy skills.', type: 'chips', required: true, suggestions: skillSuggestions },
      { id: 'interests', label: 'What kind of work interests you?', assistant: 'Pick or write areas you would actually like to explore.', type: 'chips', required: false, suggestions: ['AI', 'Data', 'Product', 'Operations', 'Design', 'Sales', 'Marketing', 'Leadership', 'Remote work'] },
      { id: 'constraints', label: 'Any constraints I should respect?', assistant: 'Optional. For example: remote only, no coding, entry-level, needs certification.', type: 'textarea', required: false },
    ] },
  {
    id: 'salary-insights', name: 'Salary Insights', route: '/free-salary-insights', category: 'salary', description: 'Report only pay ranges explicitly stated in matching listings.', introTitle: 'Let us find salary signals without making up numbers.', intro: 'Tell me the role and location. I will scan available Jobiest listings and any pasted listings, then report only stated pay.', outputType: 'salary', generationLabel: 'Check salary signals', progressMessages: ['Finding matching listings', 'Extracting stated pay only', 'Rejecting guesses', 'Preparing the denominator'], supportsCopy: true, supportsDownload: true, supportsSave: true, requiresAuthenticationToUnlock: true, nextSteps: [{ label: 'Find matching jobs', href: '/jobs' }, { label: 'Match my skills', href: '/free-skills-matcher' }, { label: 'Build my resume', href: '/generate' }], questions: [
      { id: 'targetRole', label: 'What role should I check?', assistant: 'I will match this against live listings where possible.', type: 'text', required: true, minLength: 2, suggestions: roleSuggestions },
      { id: 'location', label: 'Preferred location, optional', assistant: 'Add a city, country or remote preference if it matters.', type: 'text', required: false, placeholder: 'Lagos, Remote, UK' },
      { id: 'experienceLevel', label: 'Experience level, optional', assistant: 'This helps you interpret the listings, but I will not invent market averages.', type: 'select', required: false, options: ['Entry level', 'Mid level', 'Senior', 'Lead or executive'] },
      { id: 'pastedListings', label: 'Paste job listings with pay, optional', assistant: 'If you paste listings, I can extract any pay they explicitly state.', type: 'textarea', required: false, placeholder: 'Paste one or more listings that mention pay...' },
    ] },
];

export const FREE_TOOL_BY_ID = Object.fromEntries(FREE_TOOLS.map((tool) => [tool.id, tool])) as Record<FreeToolId, FreeToolConfig>;

export function getFreeToolConfig(id: FreeToolId): FreeToolConfig {
  return FREE_TOOL_BY_ID[id];
}

export function isFreeToolId(value: string): value is FreeToolId {
  return value in FREE_TOOL_BY_ID;
}
