import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/** All 10 free tools + core pages, everything public and indexable. */
const FREE_TOOLS = [
  '/free-job-description-analyzer',
  '/free-cover-letter-writer',
  '/free-resume-summary-generator',
  '/free-linkedin-headline-builder',
  '/free-interview-question-generator',
  '/free-skills-matcher',
  '/free-ats-resume-scanner',
  '/free-follow-up-email-writer',
  '/free-career-path-explorer',
  '/free-salary-insights',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const core: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];
  return [
    ...core,
    ...FREE_TOOLS.map((path) => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
