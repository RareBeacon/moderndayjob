import { scanResume } from '@/lib/ats/scan';
import { analyzeJob, compareSkills, generateFollowupEmail, generateInterviewQuestions, generateSalaryInsights } from '@/lib/analysis/service';
import { supabaseAdmin } from '@/lib/supabase';
import { getFreeToolConfig, type FreeToolId } from './config';

export interface FreeToolSection {
  heading: string;
  body?: string;
  items?: string[];
}

export interface FreeToolGeneration {
  toolId: FreeToolId;
  title: string;
  outputType: string;
  result: {
    summary?: string;
    sections: FreeToolSection[];
    data?: unknown;
  };
  resultText: string;
  provider: string;
  nextSteps: { label: string; href: string }[];
}

type Answers = Record<string, unknown>;
const PROVIDER = 'jobiest_free_tools_2_local_ai';
const BAD = [/results-driven professional/gi, /passionate professional/gi, /leveraged cutting-edge solutions/gi, /proven track record/gi, /synergistic/gi];

function clean(value: unknown, max = 4000) {
  if (typeof value !== 'string') return '';
  let text = value.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  for (const bad of BAD) text = text.replace(bad, '').replace(/\s+/g, ' ').trim();
  return text;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return unique(value.map((v) => clean(v, 120)).filter(Boolean));
  return unique(clean(value, 1000).split(',').map((v) => v.trim()).filter(Boolean));
}

function unique(values: string[], max = 30) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
    if (out.length >= max) break;
  }
  return out;
}

function sentence(value: string) {
  const text = clean(value, 500);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function first(...values: unknown[]) {
  return values.map((v) => clean(v, 180)).find(Boolean) ?? '';
}

function textFromSections(title: string, sections: FreeToolSection[]) {
  return [
    title,
    ...sections.flatMap((section) => [
      '',
      section.heading,
      section.body ?? '',
      ...(section.items ?? []).map((item) => `- ${item}`),
    ]),
  ].filter((line, index) => index === 0 || line !== '').join('\n').replace(/[\u2013\u2014]/g, '-').trim();
}

function formatMoney(r: { min: number | null; max: number | null; exact: number | null; currency: string; period: string }) {
  const cur = r.currency || 'listed currency';
  const period = r.period || 'period not stated';
  if (r.exact != null) return `${cur} ${r.exact.toLocaleString()} ${period}`;
  if (r.min != null && r.max != null) return `${cur} ${r.min.toLocaleString()} to ${r.max.toLocaleString()} ${period}`;
  if (r.min != null) return `${cur} ${r.min.toLocaleString()}+ ${period}`;
  if (r.max != null) return `Up to ${cur} ${r.max.toLocaleString()} ${period}`;
  return `Pay stated, amount not parsed`;
}

function profileLike(answers: Answers) {
  const role = first(answers.targetRole, answers.currentRole);
  const skills = list(answers.skills);
  const background = first(answers.background, answers.experience, answers.achievement, answers.additional);
  return { role, skills, background };
}

async function coverLetter(answers: Answers): Promise<FreeToolGeneration> {
  const role = first(answers.targetRole);
  const company = first(answers.company) || 'your team';
  const jd = clean(answers.jobDescription, 30000);
  const background = clean(answers.background, 1200);
  const skills = list(answers.skills).slice(0, 10);
  const motivation = clean(answers.motivation, 700);
  const achievement = clean(answers.achievement, 700);
  const tone = first(answers.tone) || 'Professional';
  const analysis = await analyzeJob({ jobDescription: jd, userSkills: skills, deterministicOnly: true });
  const matched = analysis.requiredSkills.filter((skill) => skills.some((s) => s.toLowerCase() === skill.toLowerCase() || s.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(s.toLowerCase()))).slice(0, 6);
  const paragraphs = [
    `Dear ${company === 'your team' ? 'hiring team' : `${company} team`},`,
    sentence(`I am applying for the ${role} role because my background connects directly with the work described in your listing`),
    sentence(background),
    matched.length ? sentence(`The parts of the role that align most closely with my experience are ${matched.join(', ')}`) : skills.length ? sentence(`My relevant skills include ${skills.join(', ')}`) : '',
    achievement ? sentence(`One example I would highlight is this: ${achievement.charAt(0).toLowerCase()}${achievement.slice(1)}`) : '',
    motivation ? sentence(`I am interested in this opportunity because ${motivation.charAt(0).toLowerCase()}${motivation.slice(1)}`) : '',
    tone.toLowerCase() === 'concise' ? 'Thank you for reviewing my application. I would welcome the opportunity to discuss the role.' : 'Thank you for reviewing my application. I would welcome the opportunity to discuss how my experience can support your team.',
  ].filter(Boolean);
  const sections = [
    { heading: 'Cover letter', body: paragraphs.join('\n\n') },
    { heading: 'Job signals used', items: unique([...(analysis.keywords ?? []), ...(analysis.requiredSkills ?? [])], 12) },
    { heading: 'Truthfulness note', body: 'This draft uses only the role, company, skills, background, motivation and achievement you supplied. No metrics or credentials were invented.' },
  ];
  const title = `${role} cover letter${company !== 'your team' ? ` for ${company}` : ''}`;
  return wrap('cover-letter-writer', title, sections, { analysis });
}

async function jdAnalyzer(answers: Answers): Promise<FreeToolGeneration> {
  const jd = clean(answers.jobDescription, 30000);
  const skills = list(answers.skills);
  const analysis = await analyzeJob({ jobDescription: jd, userSkills: skills, deterministicOnly: true });
  const sections = [
    { heading: 'Role summary', body: analysis.summary },
    { heading: 'Required skills', items: analysis.requiredSkills.length ? analysis.requiredSkills : ['No required skills were clearly stated.'] },
    { heading: 'Responsibilities', items: analysis.responsibilities.length ? analysis.responsibilities : ['No responsibilities were clearly extracted.'] },
    { heading: 'Keywords to notice', items: analysis.keywords.length ? analysis.keywords : ['No repeated keywords were detected.'] },
    { heading: 'Your skill overlap', items: [`Matched: ${analysis.matchedSkills.length ? analysis.matchedSkills.join(', ') : 'None supplied or detected'}`, `Gaps to verify: ${analysis.missingSkills.length ? analysis.missingSkills.join(', ') : 'None from supplied skills'}`] },
  ];
  return wrap('job-description-analyzer', analysis.title ? `${analysis.title} job analysis` : 'Job description analysis', sections, { analysis });
}

function skillMatcher(answers: Answers): FreeToolGeneration {
  const role = first(answers.targetRole) || 'target role';
  const skills = list(answers.skills);
  const jd = clean(answers.jobDescription, 30000);
  const keywords = extractKeywords(jd, 24);
  const likelySkills = keywords.filter((k) => /python|react|sql|api|apis|ai|automation|data|javascript|typescript|excel|aws|cloud|sales|support|marketing|seo|node|product|design|figma|llm|machine|learning/.test(k.toLowerCase()));
  const matched = compareSkills(likelySkills, skills).matched;
  const missing = compareSkills(likelySkills, skills).missing;
  const score = likelySkills.length ? Math.round((matched.length / likelySkills.length) * 100) : Math.min(80, skills.length * 10);
  const sections = [
    { heading: 'Match score', body: `${score}% alignment for ${role}. This is a keyword and context check, not a hiring prediction.` },
    { heading: 'Strengths to emphasize', items: matched.length ? matched : ['No direct skill matches found yet. Add more real skills or check another job.'] },
    { heading: 'Gaps to verify', items: missing.length ? missing.map((m) => `Only add ${m} if it is genuinely true for you.`) : ['No obvious skill gaps from the terms extracted.'] },
    { heading: 'How to use this', body: 'Work matched skills into your resume or cover letter only where your experience supports them.' },
  ];
  return wrap('skills-matcher', `${role} skills match`, sections, { score, matched, missing });
}

async function interviewPrep(answers: Answers): Promise<FreeToolGeneration> {
  const role = first(answers.targetRole);
  const jd = clean(answers.jobDescription, 30000);
  const experience = clean(answers.experience, 1200);
  const focus = list(answers.focus).slice(0, 6);
  const prep = await generateInterviewQuestions({ jobDescription: jd, deterministicOnly: true });
  const sections = [
    { heading: 'Likely interview questions', items: prep.questions.map((q) => `${q.question} Focus: ${q.focus}`) },
    { heading: 'Preparation plan', items: prep.preparationTips.length ? prep.preparationTips : ['Review the responsibilities in the listing and prepare examples from your actual experience.'] },
    experience ? { heading: 'Answer angle from your background', body: `Use this real background when answering: ${experience}` } : { heading: 'One more thing to prepare', body: 'Add two real examples from your work before the interview so your answers do not sound generic.' },
    focus.length ? { heading: 'Practice focus', items: focus } : { heading: 'Practice focus', body: 'Practice technical, behavioral and project questions if the listing includes all three.' },
  ];
  return wrap('interview-question-generator', `${role || prep.role || 'Role'} interview prep`, sections, { prep });
}

function resumeSummaries(answers: Answers): FreeToolGeneration {
  const role = first(answers.targetRole) || 'professional';
  const level = first(answers.experienceLevel);
  const background = clean(answers.background, 1200);
  const skills = list(answers.skills).slice(0, 8);
  const achievement = clean(answers.achievement, 700);
  const skillsText = skills.length ? `with skills in ${skills.join(', ')}` : '';
  const proof = achievement ? ` Highlights include ${sentence(achievement)}` : '';
  const options = unique([
    sentence(`${role} ${level ? `at ${level.toLowerCase()} level ` : ''}${skillsText}. ${background}${proof}`),
    sentence(`${role} focused on ${skills.slice(0, 4).join(', ') || 'relevant work'}. ${background}${achievement ? ` Key proof: ${achievement}` : ''}`),
    sentence(`${level ? `${level} ` : ''}${role} profile built around ${skills.slice(0, 5).join(', ') || 'the supplied background'}. ${background}`),
  ], 3);
  const sections = [
    { heading: 'Summary options', items: options },
    { heading: 'Truthfulness note', body: 'These options use only the role, level, background, skills and proof point you supplied.' },
  ];
  return wrap('resume-summary-generator', `${role} resume summary options`, sections, { options });
}

function linkedinHeadlines(answers: Answers): FreeToolGeneration {
  const role = first(answers.targetRole) || 'Professional';
  const skills = list(answers.skills).slice(0, 6);
  const experience = clean(answers.experience, 140);
  const uniqueValue = clean(answers.uniqueValue, 120);
  const options = unique([
    `${role}${skills.length ? ` | ${skills.slice(0, 3).join(' | ')}` : ''}`,
    `${role} focused on ${uniqueValue || skills.slice(0, 3).join(', ') || 'practical career impact'}`,
    `${experience ? `${experience} | ` : ''}${role}`,
    `${role}${skills.length ? ` helping teams with ${skills.slice(0, 2).join(' and ')}` : ''}`,
    `${role}${uniqueValue ? ` | ${uniqueValue}` : skills.length ? ` | ${skills.join(', ')}` : ''}`,
  ].map((s) => clean(s, 120)), 5);
  const sections = [
    { heading: 'LinkedIn headline options', items: options },
    { heading: 'How to choose', body: 'Use the option that you can defend in an interview. Remove any skill that is not genuinely yours.' },
  ];
  return wrap('linkedin-headline-builder', `${role} LinkedIn headline options`, sections, { options });
}

async function followupEmail(answers: Answers): Promise<FreeToolGeneration> {
  const company = first(answers.company);
  const role = first(answers.targetRole);
  const days = Math.max(1, Math.min(90, Number(answers.daysSinceApplied ?? 7) || 7));
  const contactName = first(answers.contactName) || undefined;
  const note = clean(answers.note, 500) || undefined;
  const email = await generateFollowupEmail({ company, role, daysSinceApplied: days, contactName, note, deterministicOnly: true });
  const sections = [
    { heading: 'Subject', body: email.subject },
    { heading: 'Email body', body: email.body },
    { heading: 'Tone note', body: 'This is intentionally short, polite and low pressure. It does not invent interviews, referrals or deadlines.' },
  ];
  return wrap('follow-up-email-writer', `${role} follow-up email for ${company}`, sections, { email });
}

function careerPaths(answers: Answers): FreeToolGeneration {
  const currentRole = first(answers.currentRole) || 'your current role';
  const skills = list(answers.skills).slice(0, 10);
  const interests = list(answers.interests).slice(0, 6);
  const constraints = clean(answers.constraints, 700);
  const base = interests.length ? interests : inferInterests(skills);
  const paths = base.slice(0, 3).map((interest, index) => {
    const direction = directionFor(interest, skills, currentRole, index);
    return {
      direction,
      why: `${direction} builds on your supplied ${skills.slice(0, 4).join(', ') || 'skills'} from ${currentRole}.`,
      buildingOn: skills.slice(0, 5),
      explore: exploreFor(direction, constraints),
    };
  });
  const sections = [
    { heading: 'Career directions to explore', items: paths.map((p) => `${p.direction}: ${p.why}`) },
    { heading: 'Skills these paths build on', items: skills.length ? skills : ['Add skills to make the paths more precise.'] },
    { heading: 'What to explore next', items: unique(paths.flatMap((p) => p.explore), 10) },
    { heading: 'Reality check', body: constraints ? `I respected this constraint: ${constraints}` : 'These are exploratory directions, not guarantees. Check real listings before committing time.' },
  ];
  return wrap('career-path-explorer', `Career paths from ${currentRole}`, sections, { paths });
}

async function salaryInsights(answers: Answers): Promise<FreeToolGeneration> {
  const role = first(answers.targetRole);
  const location = first(answers.location);
  const pasted = clean(answers.pastedListings, 30000);
  const escaped = role.replace(/[%_]/g, '');
  const { data: pool } = await supabaseAdmin
    .from('jobs')
    .select('id,title,company,description,location')
    .ilike('title', `%${escaped}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  let jobs = ((pool ?? []) as { id: string; title: string; company: string; description: string; location?: string | null }[])
    .filter((job) => !location || `${job.location ?? ''} ${job.description ?? ''}`.toLowerCase().includes(location.toLowerCase()) || location.toLowerCase().includes('remote'))
    .map((job) => ({ id: job.id, title: job.title, company: job.company, description: job.description }));
  if (pasted) jobs = [{ id: 'pasted-listings', title: role, company: 'Pasted listing', description: pasted }, ...jobs];
  if (!jobs.length) {
    const sections = [
      { heading: 'No stated pay data available', body: `I found no matching listings for ${role}${location ? ` in ${location}` : ''} and no pasted listing text with pay. I will not invent a salary range.` },
      { heading: 'What to do next', items: ['Paste listings that mention pay.', 'Check again after Jobiest syncs more jobs.', 'Use any result as a signal, not a market average.'] },
    ];
    return wrap('salary-insights', `${role} salary signals`, sections, { scannedCount: 0, statedCount: 0, ranges: [] });
  }
  const salary = await generateSalaryInsights({ jobs, deterministicOnly: true });
  const sections = [
    { heading: 'Salary signals', body: `${jobs.length} listing(s) scanned. ${salary.ranges.length} listing(s) stated pay. No estimates or averages are included.` },
    { heading: 'Stated ranges', items: salary.ranges.length ? salary.ranges.map((r) => `${formatMoney(r)} from listing ${r.jobId}`) : ['None of the scanned listings clearly stated pay.'] },
    { heading: 'Notes', body: salary.notes || 'Treat stated pay as a listing signal, not a market rate.' },
  ];
  return wrap('salary-insights', `${role} salary signals`, sections, { scannedCount: jobs.length, statedCount: salary.ranges.length, ranges: salary.ranges });
}

function atsScan(answers: Answers): FreeToolGeneration {
  const resumeText = clean(answers.resumeText, 60000);
  const jobDescription = clean(answers.jobDescription, 30000);
  const result = scanResume(resumeText, jobDescription.length >= 30 ? jobDescription : undefined);
  const sections = [
    { heading: 'ATS parseability score', body: `${result.score}/100. This score checks structure and parseability, not your worth as a candidate.` },
    { heading: 'Findings', items: result.findings.map((f) => `${f.status.toUpperCase()}: ${f.check}. ${f.detail}${f.tip ? ` Tip: ${f.tip}` : ''}`) },
    result.keywords ? { heading: 'Keyword overlap', items: [`Matched: ${result.keywords.matched.length ? result.keywords.matched.join(', ') : 'None'}`, `Missing: ${result.keywords.missing.length ? result.keywords.missing.join(', ') : 'None'}`] } : { heading: 'Keyword overlap', body: 'Paste a job description next time to check role-specific keywords.' },
  ];
  return wrap('ats-resume-scanner', 'ATS resume scan', sections, result);
}

export async function generateFreeToolResult(toolId: FreeToolId, answers: Answers): Promise<FreeToolGeneration> {
  if (toolId === 'ats-resume-scanner') return atsScan(answers);
  if (toolId === 'cover-letter-writer') return coverLetter(answers);
  if (toolId === 'job-description-analyzer') return jdAnalyzer(answers);
  if (toolId === 'skills-matcher') return skillMatcher(answers);
  if (toolId === 'interview-question-generator') return interviewPrep(answers);
  if (toolId === 'resume-summary-generator') return resumeSummaries(answers);
  if (toolId === 'linkedin-headline-builder') return linkedinHeadlines(answers);
  if (toolId === 'follow-up-email-writer') return followupEmail(answers);
  if (toolId === 'career-path-explorer') return careerPaths(answers);
  return salaryInsights(answers);
}

function wrap(toolId: FreeToolId, rawTitle: string, sections: FreeToolSection[], data?: unknown): FreeToolGeneration {
  const config = getFreeToolConfig(toolId);
  const title = clean(rawTitle, 180) || config.name;
  const cleanedSections = sections.map((section) => ({
    heading: clean(section.heading, 120),
    body: section.body ? clean(section.body, 5000) : undefined,
    items: section.items ? section.items.map((item) => clean(item, 800)).filter(Boolean) : undefined,
  })).filter((section) => section.heading || section.body || section.items?.length);
  const resultText = textFromSections(title, cleanedSections);
  return {
    toolId,
    title,
    outputType: config.outputType,
    result: { summary: cleanedSections[0]?.body, sections: cleanedSections, data },
    resultText,
    provider: PROVIDER,
    nextSteps: config.nextSteps,
  };
}

function extractKeywords(text: string, top = 12) {
  const stop = new Set('the and with for from that this you are was were will have has into your our their role job candidate experience skills using use work team teams build built create created manage managed develop developed strong excellent ability responsibilities requirements preferred needed about must should company looking seeking years year'.split(' '));
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const word = raw.replace(/^\.+|\.+$/g, '');
    if (word.length < 3 || stop.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top).map(([word]) => word);
}

function inferInterests(skills: string[]) {
  const text = skills.join(' ').toLowerCase();
  if (/ai|python|automation|llm|machine/.test(text)) return ['AI', 'Data', 'Automation'];
  if (/react|javascript|typescript|node|api/.test(text)) return ['Software', 'Product', 'Cloud'];
  if (/sales|customer|support|hubspot/.test(text)) return ['Customer Success', 'Sales', 'Operations'];
  if (/seo|content|marketing|brand/.test(text)) return ['Marketing', 'Growth', 'Content'];
  return ['Operations', 'Project Management', 'Customer Success'];
}

function directionFor(interest: string, skills: string[], currentRole: string, index: number) {
  const lower = interest.toLowerCase();
  if (/ai/.test(lower)) return 'AI Automation Specialist';
  if (/data/.test(lower)) return 'Data Analyst';
  if (/automation/.test(lower)) return 'Workflow Automation Specialist';
  if (/software|cloud/.test(lower)) return 'Software Engineer';
  if (/product/.test(lower)) return 'Product Analyst';
  if (/sales/.test(lower)) return 'Sales Operations Specialist';
  if (/marketing|growth/.test(lower)) return 'Growth Marketing Specialist';
  if (/content/.test(lower)) return 'Content Strategist';
  if (/customer/.test(lower)) return 'Customer Success Specialist';
  if (/leadership/.test(lower)) return 'Team Lead Track';
  return [`${currentRole} Specialist`, 'Operations Coordinator', 'Project Coordinator'][index] ?? `${currentRole} Specialist`;
}

function exploreFor(direction: string, constraints: string) {
  const lower = direction.toLowerCase();
  const base = /ai|automation/.test(lower)
    ? ['AI workflow portfolios', 'API integrations', 'automation case studies']
    : /data/.test(lower)
      ? ['SQL practice', 'dashboard projects', 'analytics portfolios']
      : /software/.test(lower)
        ? ['project portfolio', 'testing basics', 'deployment workflow']
        : /marketing|growth|content/.test(lower)
          ? ['campaign examples', 'SEO basics', 'analytics reporting']
          : ['role descriptions', 'entry requirements', 'sample job listings'];
  return constraints ? [...base, `Check fit against constraint: ${constraints}`] : base;
}
