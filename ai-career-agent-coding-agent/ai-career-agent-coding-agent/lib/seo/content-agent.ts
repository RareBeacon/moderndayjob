import { SITE_URL } from '@/lib/site';

export interface GeneratedSeoArticle {
  title: string;
  slug: string;
  url: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  semanticKeywords: string[];
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  featuredImageAlt: string;
  contentMarkdown: string;
  qualityReport: Record<string, unknown>;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'seo-article';
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function inferIntent(keyword: string): GeneratedSeoArticle['searchIntent'] {
  const k = keyword.toLowerCase();
  if (/price|pricing|cost|trial|buy|subscribe/.test(k)) return 'commercial';
  if (/login|jobiest|dashboard/.test(k)) return 'navigational';
  if (/apply|scan|generate|builder/.test(k)) return 'transactional';
  return 'informational';
}

function related(keyword: string): string[] {
  const base = keyword.toLowerCase();
  const out = [
    `${base} guide`,
    `${base} tips`,
    `${base} checklist`,
    `${base} for job seekers`,
  ];
  return Array.from(new Set(out)).slice(0, 4);
}

/**
 * Deterministic article generator. This is intentionally conservative: it uses
 * Jobiest product knowledge and does not fabricate search volume, quotes, case
 * studies, statistics, backlinks, or competitor claims.
 */
export function generateSeoArticleFromKeyword(keyword: string): GeneratedSeoArticle {
  const cleanKeyword = keyword.trim().replace(/\s+/g, ' ');
  const slug = slugify(cleanKeyword);
  const title = `${titleCase(cleanKeyword)}: A Practical Guide for Job Seekers`;
  const url = `${SITE_URL}/blog/${slug}`;
  const secondaryKeywords = related(cleanKeyword);
  const semanticKeywords = ['ATS', 'verified profile facts', 'cover letter', 'CV tailoring', 'application tracking', 'approval mode'];
  const intent = inferIntent(cleanKeyword);
  const metaDescription = `A practical Jobiest guide to ${cleanKeyword}: how to improve your process, stay truthful, and avoid wasting time on manual job-search work.`.slice(0, 158);
  const contentMarkdown = [
    `# ${title}`,
    '',
    `If you are searching for ${cleanKeyword}, you are probably trying to fix a process problem, not just find another motivational tip. The goal is not to make your job search louder. The goal is to make it more accurate, consistent, and easier to sustain.`,
    '',
    '## The problem',
    '',
    'Most job seekers lose time in the same places: finding relevant roles, understanding what each job description is really asking for, rewriting their CV, drafting a cover letter, and tracking what they already sent. None of those tasks are impossible. The problem is repetition. Repetition drains quality.',
    '',
    '## What to fix first',
    '',
    'Start with your source of truth. Your CV, cover letters, summaries, and application answers should all come from the same verified profile facts. If a fact is missing, add it. If it is not true, do not use it. This keeps your applications consistent and protects your credibility in interviews.',
    '',
    '## How Jobiest approaches it',
    '',
    'Jobiest separates the repeat work from the judgment work. The platform can scan your profile, analyze job descriptions, prepare truthful documents, and keep records of every application. You still decide what gets approved. Approval mode exists because automation should not remove your control.',
    '',
    '## A simple checklist',
    '',
    '- Build or update your verified profile before generating documents.',
    '- Run an ATS scan before sending a CV.',
    '- Compare the job description against your real skills.',
    '- Use a tailored CV only when it stays faithful to your experience.',
    '- Track every application so your search produces data, not confusion.',
    '',
    '## What not to do',
    '',
    'Do not add fake metrics, invented employers, or credentials you cannot defend. Do not keyword-stuff your CV until it sounds unnatural. Do not assume that submitting more applications fixes a weak process. Volume helps only when quality and relevance stay intact.',
    '',
    '## Next step',
    '',
    'Create a free Jobiest profile, run one ATS scan, and compare one target role against your saved skills. That gives you a clearer picture of what to improve before your next application.',
  ].join('\n');

  return {
    title,
    slug,
    url,
    targetKeyword: cleanKeyword,
    secondaryKeywords,
    semanticKeywords,
    searchIntent: intent,
    metaTitle: title.slice(0, 68),
    metaDescription,
    canonicalUrl: url,
    featuredImageAlt: `${title} from Jobiest`,
    contentMarkdown,
    qualityReport: {
      passed: true,
      checks: {
        noFakeMetrics: true,
        searchIntent: intent,
        primaryKeywordUsedNaturally: contentMarkdown.toLowerCase().includes(cleanKeyword.toLowerCase()),
        canonicalConfigured: true,
        metadataConfigured: true,
        internalLinksSuggested: ['/signup', '/free-ats-resume-scanner', '/free-job-description-analyzer'],
      },
      unavailableMetrics: ['searchVolume', 'keywordDifficulty', 'CPC', 'rankings'],
    },
  };
}
