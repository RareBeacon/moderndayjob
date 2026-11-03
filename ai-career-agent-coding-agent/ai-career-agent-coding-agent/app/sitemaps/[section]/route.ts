import { NextResponse } from 'next/server';
import { BLOG_POSTS } from '@/lib/seo/blog';
import { CORE_SEO_PATHS, FREE_TOOL_SEO_PATHS, canonicalPublicUrl } from '@/lib/seo/public-urls';
import { TOPIC_CLUSTERS } from '@/lib/seo/topic-clusters';
import { SITE_URL } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase';
import { listActivePublicJobs, PUBLIC_JOB_LOCATION_HUBS, PUBLIC_JOB_ROLE_HUBS, MIN_HUB_JOBS_FOR_INDEX, jobMatchesRoleHub, jobMatchesLocationHub } from '@/lib/seo/public-jobs';
import { RESUME_TEMPLATES } from '@/lib/resume-studio/templates';
import { CV_EXAMPLE_ROLES } from '@/lib/seo/cv-examples';

export const dynamic = 'force-dynamic';

const XML_TYPE = 'application/xml; charset=utf-8';
const REVALIDATE_SECONDS = 3600;

type SitemapSection = 'core' | 'tools' | 'blog' | 'templates' | 'cv-examples' | 'jobs' | 'clusters';
type SitemapEntry = { url: string; lastmod?: string; changefreq: string; priority: number };

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function sitemapXml(entries: SitemapEntry[]): string {
  const body = entries.map((entry) => [
    '<url>',
    `<loc>${esc(entry.url)}</loc>`,
    entry.lastmod ? `<lastmod>${esc(entry.lastmod)}</lastmod>` : '',
    `<changefreq>${entry.changefreq}</changefreq>`,
    `<priority>${entry.priority}</priority>`,
    '</url>',
  ].join('')).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

function xmlResponse(section: string, entries: SitemapEntry[], cacheSeconds = REVALIDATE_SECONDS) {
  return new NextResponse(sitemapXml(entries), {
    headers: {
      'Content-Type': XML_TYPE,
      'Cache-Control': `public, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`,
      'X-Robots-Tag': 'noindex',
    },
  });
}

function entry(url: string, priority = 0.65, lastmod?: string, changefreq = 'weekly'): SitemapEntry {
  return { url, priority, lastmod, changefreq };
}

async function dynamicBlogEntries(): Promise<SitemapEntry[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('seo_articles')
      .select('url,last_updated,published_at')
      .eq('status', 'PUBLISHED')
      .order('published_at', { ascending: false })
      .limit(2000);
    if (error || !data) return [];
    return data.filter((row) => String(row.url).startsWith(`${SITE_URL}/blog/`))
      .map((row) => entry(String(row.url), 0.72, String(row.last_updated ?? row.published_at ?? new Date().toISOString())));
  } catch {
    return [];
  }
}

async function publicPortfolioEntries(): Promise<SitemapEntry[]> {
  try {
    const { data, error } = await supabaseAdmin.from('portfolios').select('slug,updated_at').eq('visibility', 'PUBLIC').limit(1000);
    if (error || !data) return [];
    return data.map((row) => entry(`${SITE_URL}/portfolio/${row.slug}`, 0.5, String(row.updated_at)));
  } catch {
    return [];
  }
}

async function entriesFor(section: SitemapSection): Promise<SitemapEntry[]> {
  const now = new Date().toISOString();
  if (section === 'core') {
    const core = CORE_SEO_PATHS.map((path) => entry(canonicalPublicUrl(path), path === '/' ? 1 : 0.6, now));
    return [...core, ...await publicPortfolioEntries()];
  }
  if (section === 'tools') return FREE_TOOL_SEO_PATHS.map((path) => entry(canonicalPublicUrl(path), 0.8, now));
  if (section === 'blog') {
    const seeded = BLOG_POSTS.map((post) => entry(`${SITE_URL}/blog/${post.slug}`, 0.75, post.publishedAt));
    return [...seeded, ...await dynamicBlogEntries()];
  }
  if (section === 'templates') {
    return RESUME_TEMPLATES.map((template) => entry(`${SITE_URL}/templates/${template.id}`, 0.7, now));
  }
  if (section === 'cv-examples') {
    return CV_EXAMPLE_ROLES.map((role) => entry(`${SITE_URL}/cv-examples/${role.slug}`, 0.7, now));
  }
  if (section === 'clusters') {
    return TOPIC_CLUSTERS.map((cluster) => entry(`${SITE_URL}/blog/topic/${cluster.slug}`, 0.65, now));
  }

  const jobs = await listActivePublicJobs(1000);
  const eligibleRoleHubs = PUBLIC_JOB_ROLE_HUBS.filter((hub) => jobs.filter((job) => jobMatchesRoleHub(job, hub)).length >= MIN_HUB_JOBS_FOR_INDEX);
  const eligibleLocationHubs = PUBLIC_JOB_LOCATION_HUBS.filter((hub) => jobs.filter((job) => jobMatchesLocationHub(job, hub)).length >= MIN_HUB_JOBS_FOR_INDEX);
  return [
    entry(`${SITE_URL}/jobs`, 0.9, now),
    ...jobs.map((job) => entry(`${SITE_URL}/jobs/${job.slug}`, 0.78, job.updatedAt)),
    ...eligibleRoleHubs.map((hub) => entry(`${SITE_URL}/jobs/role/${hub.slug}`, 0.68, now)),
    ...eligibleLocationHubs.map((hub) => entry(`${SITE_URL}/jobs/location/${hub.slug}`, 0.68, now)),
  ];
}

function indexResponse() {
  const sections: SitemapSection[] = ['core', 'tools', 'blog', 'templates', 'cv-examples', 'jobs', 'clusters'];
  const sitemaps = sections.map((section) => `<sitemap><loc>${esc(`${SITE_URL}/sitemaps/${section}.xml`)}</loc></sitemap>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps}</sitemapindex>`;
  return new NextResponse(xml, {
    headers: {
      'Content-Type': XML_TYPE,
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export async function GET(request: Request, context: { params: Promise<{ section: string }> }) {
  const { section: raw } = await context.params;
  const normalized = raw.replace(/\.xml$/, '');
  if (normalized === 'index' || normalized === '') return indexResponse();
  if (!['core', 'tools', 'blog', 'templates', 'cv-examples', 'jobs', 'clusters'].includes(normalized)) {
    return new NextResponse('Not Found', { status: 404 });
  }
  const entries = await entriesFor(normalized as SitemapSection);
  return xmlResponse(normalized, entries, normalized === 'jobs' ? 900 : REVALIDATE_SECONDS);
}
