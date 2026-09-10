import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { BLOG_POSTS } from '@/lib/seo/blog';
import { supabaseAdmin } from '@/lib/supabase';

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

async function publishedSeoArticles(): Promise<MetadataRoute.Sitemap> {
  try {
    const { data, error } = await supabaseAdmin
      .from('seo_articles')
      .select('url, last_updated, published_at')
      .eq('status', 'PUBLISHED');
    if (error || !data) return [];
    return data.map((row) => ({
      url: String(row.url),
      lastModified: new Date(String(row.last_updated ?? row.published_at ?? new Date().toISOString())),
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    }));
  } catch {
    // SEO tables may not exist until the migration is applied; static sitemap remains valid.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const core: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/refund`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/jobs`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
  ];
  const staticBlog = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }));
  return [
    ...core,
    ...FREE_TOOLS.map((path) => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...staticBlog,
    ...(await publishedSeoArticles()),
  ];
}
