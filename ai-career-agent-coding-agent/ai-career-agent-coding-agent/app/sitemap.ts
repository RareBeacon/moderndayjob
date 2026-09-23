import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { BLOG_POSTS } from '@/lib/seo/blog';
import { CORE_SEO_PATHS, FREE_TOOL_SEO_PATHS, canonicalPublicUrl, isAllowedPublicSeoUrl } from '@/lib/seo/public-urls';
import { supabaseAdmin } from '@/lib/supabase';

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const core: MetadataRoute.Sitemap = CORE_SEO_PATHS.map((path) => ({
    url: canonicalPublicUrl(path),
    lastModified: now,
    changeFrequency: path === '/' ? 'daily' as const : path === '/pricing' || path === '/blog' || path === '/tools' ? 'weekly' as const : path === '/terms' || path === '/privacy' || path === '/refund' ? 'yearly' as const : 'monthly' as const,
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
  ].filter((entry) => isAllowedPublicSeoUrl(entry.url));
  const seen = new Set<string>();
  return urls.filter((entry) => {
    const key = entry.url.replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
