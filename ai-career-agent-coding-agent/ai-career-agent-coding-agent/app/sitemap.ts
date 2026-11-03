import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { BLOG_POSTS } from '@/lib/seo/blog';
import { CORE_SEO_PATHS, FREE_TOOL_SEO_PATHS, canonicalPublicUrl, isAllowedPublicSeoUrl } from '@/lib/seo/public-urls';
import { supabaseAdmin } from '@/lib/supabase';
import { RESUME_TEMPLATES } from '@/lib/resume-studio/templates';
import { CV_EXAMPLE_ROLES } from '@/lib/seo/cv-examples';
import { TOPIC_CLUSTERS } from '@/lib/seo/topic-clusters';
import { listActivePublicJobs, jobMatchesRoleHub, jobMatchesLocationHub, PUBLIC_JOB_ROLE_HUBS, PUBLIC_JOB_LOCATION_HUBS, MIN_HUB_JOBS_FOR_INDEX } from '@/lib/seo/public-jobs';

export const dynamic = 'force-dynamic';

async function publishedSeoArticles(): Promise<MetadataRoute.Sitemap> {
  try {
    const { data, error } = await supabaseAdmin
      .from('seo_articles')
      .select('url, last_updated, published_at')
      .eq('status', 'PUBLISHED');
    if (error || !data) return [];
    return data
      .filter((row) => isAllowedPublicSeoUrl(String(row.url)))
      .map((row) => ({
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

/** Public portfolios (Milestone 6): only visibility='PUBLIC' is listed.
 *  Unlisted pages are reachable by link but stay out of search engines. */
async function publicPortfolios(): Promise<MetadataRoute.Sitemap> {
  try {
    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .select('slug, updated_at')
      .eq('visibility', 'PUBLIC')
      .limit(1000);
    if (error || !data) return [];
    return data.map((row) => ({
      url: `${SITE_URL}/portfolio/${row.slug}`,
      lastModified: new Date(row.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

async function publicJobSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const jobs = await listActivePublicJobs(1000);
  const roleHubs = PUBLIC_JOB_ROLE_HUBS.filter((hub) => jobs.filter((job) => jobMatchesRoleHub(job, hub)).length >= MIN_HUB_JOBS_FOR_INDEX);
  const locationHubs = PUBLIC_JOB_LOCATION_HUBS.filter((hub) => jobs.filter((job) => jobMatchesLocationHub(job, hub)).length >= MIN_HUB_JOBS_FOR_INDEX);
  return [
    { url: `${SITE_URL}/jobs`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.9 },
    ...jobs.map((job) => ({ url: `${SITE_URL}/jobs/${job.slug}`, lastModified: new Date(job.updatedAt), changeFrequency: 'daily' as const, priority: 0.75 })),
    ...roleHubs.map((hub) => ({ url: `${SITE_URL}/jobs/role/${hub.slug}`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.68 })),
    ...locationHubs.map((hub) => ({ url: `${SITE_URL}/jobs/location/${hub.slug}`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.68 })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const core: MetadataRoute.Sitemap = CORE_SEO_PATHS.map((path) => ({
    url: canonicalPublicUrl(path),
    lastModified: now,
    changeFrequency: path === '/' ? 'daily' as const : path === '/pricing' || path === '/blog' || path === '/tools' ? 'weekly' as const : path === '/terms' || path === '/privacy' || path === '/refund' || path === '/dpa' || path === '/msa' || path === '/contact' ? 'yearly' as const : 'monthly' as const,
    priority: path === '/' ? 1 : path === '/pricing' || path === '/how-it-works' || path === '/tools' ? 0.9 : path === '/blog' ? 0.85 : path === '/about' ? 0.8 : path === '/help' ? 0.6 : 0.2,
  }));
  const staticBlog = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }));
  const urls = [
    ...core,
    ...FREE_TOOL_SEO_PATHS.map((path) => ({ url: canonicalPublicUrl(path), lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...staticBlog,
    ...(await publishedSeoArticles()),
    ...(await publicPortfolios()),
    ...RESUME_TEMPLATES.map((template) => ({ url: `${SITE_URL}/templates/${template.id}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 })),
    ...CV_EXAMPLE_ROLES.map((role) => ({ url: `${SITE_URL}/cv-examples/${role.slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 })),
    ...TOPIC_CLUSTERS.map((cluster) => ({ url: `${SITE_URL}/blog/topic/${cluster.slug}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.65 })),
    ...['ats-resume-scanner', 'interview-questions', 'salary-insights'].flatMap((tool) => CV_EXAMPLE_ROLES.map((role) => ({ url: `${SITE_URL}/tools/${tool}/${role.slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.65 }))),
    ...await publicJobSitemapEntries(),
  ].filter((entry) => isAllowedPublicSeoUrl(entry.url));
  const seen = new Set<string>();
  return urls.filter((entry) => {
    const key = entry.url.replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
