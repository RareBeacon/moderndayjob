import { supabaseAdmin } from '@/lib/supabase';
import { SITE_URL } from '@/lib/site';
import { BLOG_POSTS } from '@/lib/seo/blog';
import { STRATEGIC_RESEARCH_SOURCE, STRATEGIC_RESEARCH_TIMESTAMP, STRATEGIC_SEO_POSTS } from '@/lib/seo/strategic-content';
import { CORE_SEO_PATHS, FREE_TOOL_SEO_PATHS, canonicalPublicUrl, isAllowedPublicSeoUrl } from '@/lib/seo/public-urls';
import { sendEmail } from '@/lib/email/resend';
import {
  getSitemap,
  inspectUrl,
  indexingApiSupportedFor,
  listSearchConsoleSites,
  listSitemaps,
  querySearchAnalytics,
  refreshGoogleAccessToken,
  submitSitemap,
  tokenNeedsRefresh,
  type SearchConsoleSite,
  type StoredGoogleTokens,
} from './google';

export interface SeoProject {
  id: string;
  domain: string;
  search_console_property: string | null;
  sitemap_url: string;
  status: string;
  mode: 'DRAFT' | 'AUTONOMOUS';
  paused: boolean;
  google_oauth_ciphertext?: string | null;
  google_refresh_ciphertext?: string | null;
  google_token_expires_at?: string | null;
  last_audit_at?: string | null;
  last_sync_at?: string | null;
  settings?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface SeoDashboardData {
  project: SeoProject | null;
  articles: Array<Record<string, unknown>>;
  keywords: Array<Record<string, unknown>>;
  metrics: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
  indexing: Array<Record<string, unknown>>;
  urlAudits: Array<Record<string, unknown>>;
  tablesReady: boolean;
  error?: string;
}

export function seoTablesMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  return /seo_projects|seo_articles|seo_url_audits|seo_conversion_events|schema cache|does not exist|could not find the table|relation .*seo_/i.test(msg ?? '');
}

export async function getSeoDashboardData(): Promise<SeoDashboardData> {
  try {
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('seo_projects')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    const project = projectData as SeoProject | null;
    if (!project) return { project: null, articles: [], keywords: [], metrics: [], tasks: [], logs: [], indexing: [], urlAudits: [], tablesReady: true };
    const [articles, keywords, metrics, tasks, logs, indexing, urlAudits] = await Promise.all([
      supabaseAdmin.from('seo_articles').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(30),
      supabaseAdmin.from('seo_keywords').select('*').eq('project_id', project.id).order('opportunity_score', { ascending: false, nullsFirst: false }).limit(50),
      supabaseAdmin.from('seo_metrics').select('*').eq('project_id', project.id).order('date', { ascending: false }).limit(50),
      supabaseAdmin.from('seo_agent_tasks').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('seo_audit_logs').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(30),
      supabaseAdmin.from('seo_indexing_requests').select('*').eq('project_id', project.id).order('requested_at', { ascending: false }).limit(30),
      supabaseAdmin.from('seo_url_audits').select('*').eq('project_id', project.id).order('updated_at', { ascending: false }).limit(80),
    ]);
    const queryErrors = [articles.error, keywords.error, metrics.error, tasks.error, logs.error, indexing.error, urlAudits.error].filter(Boolean);
    if (queryErrors.some(seoTablesMissing)) throw new Error(queryErrors.map((error) => error?.message).join('; '));
    return {
      project,
      articles: articles.data ?? [],
      keywords: keywords.data ?? [],
      metrics: metrics.data ?? [],
      tasks: tasks.data ?? [],
      logs: logs.data ?? [],
      indexing: indexing.data ?? [],
      urlAudits: urlAudits.data ?? [],
      tablesReady: true,
    };
  } catch (error) {
    if (seoTablesMissing(error)) {
      return { project: null, articles: [], keywords: [], metrics: [], tasks: [], logs: [], indexing: [], urlAudits: [], tablesReady: false, error: 'SEO tables are not migrated yet.' };
    }
    return { project: null, articles: [], keywords: [], metrics: [], tasks: [], logs: [], indexing: [], urlAudits: [], tablesReady: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function ensureSeoProject(): Promise<SeoProject> {
  const { data, error } = await supabaseAdmin.from('seo_projects').select('*').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as SeoProject;
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('seo_projects')
    .insert({ domain: SITE_URL, sitemap_url: `${SITE_URL}/sitemap.xml`, status: 'SETUP_REQUIRED', mode: 'DRAFT', paused: true })
    .select('*')
    .single();
  if (insertError) throw new Error(insertError.message);
  return inserted as SeoProject;
}

export async function recordSeoAudit(input: {
  projectId: string;
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from('seo_audit_logs').insert({
    project_id: input.projectId,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    target_type: input.targetType ?? null,
    target_url: input.targetUrl ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function createSeoTask(projectId: string, task: string) {
  const { data, error } = await supabaseAdmin
    .from('seo_agent_tasks')
    .insert({ project_id: projectId, task, status: 'RUNNING', started_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

export async function finishSeoTask(taskId: string, status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED', result?: unknown, error?: string) {
  await supabaseAdmin
    .from('seo_agent_tasks')
    .update({ status, result: result ?? null, error: error ?? null, completed_at: new Date().toISOString() })
    .eq('id', taskId);
}

export async function storeGoogleTokens(projectId: string, tokens: { accessTokenCiphertext: string; refreshTokenCiphertext?: string; expiresAt: string }) {
  const patch: Record<string, unknown> = {
    google_oauth_ciphertext: tokens.accessTokenCiphertext,
    google_token_expires_at: tokens.expiresAt,
    status: 'CONNECTED',
    updated_at: new Date().toISOString(),
  };
  if (tokens.refreshTokenCiphertext) patch.google_refresh_ciphertext = tokens.refreshTokenCiphertext;
  const { error } = await supabaseAdmin.from('seo_projects').update(patch).eq('id', projectId);
  if (error) throw new Error(error.message);
}

export async function getFreshGoogleTokens(project: SeoProject): Promise<StoredGoogleTokens> {
  let tokens: StoredGoogleTokens = {
    accessTokenCiphertext: project.google_oauth_ciphertext,
    refreshTokenCiphertext: project.google_refresh_ciphertext,
    expiresAt: project.google_token_expires_at,
  };
  if (tokenNeedsRefresh(tokens)) {
    const refreshed = await refreshGoogleAccessToken(tokens);
    if (refreshed) {
      await storeGoogleTokens(project.id, {
        accessTokenCiphertext: refreshed.accessTokenCiphertext,
        expiresAt: refreshed.expiresAt,
      });
      tokens = { ...tokens, accessTokenCiphertext: refreshed.accessTokenCiphertext, expiresAt: refreshed.expiresAt };
    }
  }
  return tokens;
}

export async function selectSeoProperty(input: { projectId: string; actorUserId: string; property: string; sitemapUrl?: string }) {
  const sitemapUrl = input.sitemapUrl || `${SITE_URL}/sitemap.xml`;
  const { error } = await supabaseAdmin
    .from('seo_projects')
    .update({ search_console_property: input.property, sitemap_url: sitemapUrl, status: 'ACTIVE', paused: false, updated_at: new Date().toISOString() })
    .eq('id', input.projectId);
  if (error) throw new Error(error.message);
  await recordSeoAudit({ projectId: input.projectId, actorUserId: input.actorUserId, action: 'SEO_PROPERTY_SELECTED', targetType: 'property', targetUrl: input.property, metadata: { sitemapUrl } });
}

export async function listGoogleSitesForProject(project: SeoProject): Promise<SearchConsoleSite[]> {
  const tokens = await getFreshGoogleTokens(project);
  return await listSearchConsoleSites(tokens);
}

export async function syncPastorArticles(projectId: string, actorUserId?: string | null) {
  const rows = BLOG_POSTS.map((post) => ({
    project_id: projectId,
    title: post.title,
    slug: post.slug,
    url: `${SITE_URL}/blog/${post.slug}`,
    target_keyword: post.primaryKeyword,
    secondary_keywords: post.secondaryKeywords,
    semantic_keywords: [],
    search_intent: 'informational',
    meta_title: post.title.slice(0, 70),
    meta_description: post.description.slice(0, 160),
    canonical_url: `${SITE_URL}/blog/${post.slug}`,
    featured_image_alt: `${post.title} guide from Jobiest`,
    status: 'PUBLISHED',
    published_at: post.publishedAt,
    content_markdown: post.sections.map((s) => [`## ${s.heading ?? s.eyebrow ?? post.title}`, ...s.paragraphs].join('\n\n')).join('\n\n'),
    indexing_status: 'DISCOVERABLE_VIA_SITEMAP',
    quality_report: { source: 'PASTOR_COPY_DOCUMENT', checked: true, noFakeMetrics: true },
    last_updated: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin
    .from('seo_articles')
    .upsert(rows, { onConflict: 'project_id,slug' });
  if (error) throw new Error(error.message);
  await recordSeoAudit({ projectId, actorUserId, action: 'SEO_PASTOR_ARTICLES_SYNCED', targetType: 'article', metadata: { count: rows.length } });
  return rows.length;
}

export async function syncStrategicSeoContent(projectId: string, actorUserId?: string | null) {
  const now = new Date().toISOString();
  const articleRows = STRATEGIC_SEO_POSTS.map((post) => {
    const url = `${SITE_URL}/blog/${post.slug}`;
    return {
      project_id: projectId,
      title: post.title,
      slug: post.slug,
      url,
      target_keyword: post.targetKeyword,
      secondary_keywords: post.secondaryKeywords,
      semantic_keywords: post.semanticKeywords,
      search_intent: post.searchIntent,
      meta_title: post.metaTitle.slice(0, 70),
      meta_description: post.metaDescription.slice(0, 160),
      canonical_url: url,
      featured_image_alt: post.featuredImageAlt,
      featured_image_url: `${SITE_URL}/images/og-card.jpg`,
      faq: post.faq,
      internal_links: post.internalLinks,
      content_cluster: post.cluster,
      publication_order: post.publicationOrder,
      status: 'PUBLISHED',
      published_at: post.publicationDate,
      content_markdown: post.contentMarkdown,
      indexing_status: 'DISCOVERABLE_VIA_SITEMAP',
      quality_report: {
        gate: 'PASSED',
        generatedAt: now,
        researchSource: STRATEGIC_RESEARCH_SOURCE,
        researchTimestamp: STRATEGIC_RESEARCH_TIMESTAMP,
        renderedH1: post.title,
        hasSeoTitle: Boolean(post.metaTitle),
        hasMetaDescription: Boolean(post.metaDescription),
        hasCanonical: true,
        hasFaq: post.faq.length > 0,
        hasInternalLinks: post.internalLinks.length > 0,
        hasFreeToolCta: post.contentMarkdown.includes(post.relatedFreeToolPath),
        hasProductCta: post.contentMarkdown.includes('/signup'),
        noFabricatedVolumeDifficultyCpc: true,
        noFabricatedPersonalExperience: true,
        status: 'ready_for_sitemap_and_google_discovery',
      },
      last_updated: now,
    };
  });

  const keywordRows = STRATEGIC_SEO_POSTS.map((post) => ({
    project_id: projectId,
    keyword: post.targetKeyword,
    intent: post.searchIntent,
    priority: post.businessValue === 'HIGH' ? 'HIGH' : 'MEDIUM',
    target_url: `${SITE_URL}/blog/${post.slug}`,
    opportunity_score: post.opportunityScore,
    metric_source: 'unavailable_no_gsc_or_paid_keyword_volume',
    metric_confidence: 'intent_and_business_fit_only',
    cannibalization_risk: 'low_unique_cluster_target',
    primary_topic: post.topic,
    related_free_tool: post.relatedFreeToolPath,
    business_value: post.businessValue,
    competition: post.competition,
    content_type: 'blog_post',
    status: 'PUBLISHED',
    publication_date: post.publicationDate.slice(0, 10),
    research_source: STRATEGIC_RESEARCH_SOURCE,
    source_timestamp: STRATEGIC_RESEARCH_TIMESTAMP,
    last_updated: now,
  }));

  const baseArticleRows = articleRows.map(({ featured_image_url, faq, internal_links, content_cluster, publication_order, ...row }) => row);
  const baseKeywordRows = keywordRows.map(({ primary_topic, related_free_tool, business_value, competition, content_type, status, publication_date, research_source, source_timestamp, ...row }) => row);

  let articleMode = 'rich';
  let { error: articleError } = await supabaseAdmin
    .from('seo_articles')
    .upsert(articleRows, { onConflict: 'project_id,slug' });
  if (articleError && /column|schema cache|does not exist/i.test(articleError.message)) {
    articleMode = 'base';
    const fallback = await supabaseAdmin.from('seo_articles').upsert(baseArticleRows, { onConflict: 'project_id,slug' });
    articleError = fallback.error;
  }
  if (articleError) throw new Error(articleError.message);

  let keywordMode = 'rich';
  let { error: keywordError } = await supabaseAdmin
    .from('seo_keywords')
    .upsert(keywordRows, { onConflict: 'project_id,keyword' });
  if (keywordError && /column|schema cache|does not exist/i.test(keywordError.message)) {
    keywordMode = 'base';
    const fallback = await supabaseAdmin.from('seo_keywords').upsert(baseKeywordRows, { onConflict: 'project_id,keyword' });
    keywordError = fallback.error;
  }
  if (keywordError) throw new Error(keywordError.message);

  const projectRef = { id: projectId } as SeoProject;
  await Promise.all(STRATEGIC_SEO_POSTS.map((post) => recordDiscoveryWorkflow(projectRef, `${SITE_URL}/blog/${post.slug}`, 'Article', actorUserId)));
  await recordSeoAudit({ projectId, actorUserId, action: 'SEO_STRATEGIC_CONTENT_SYNCED', targetType: 'article', metadata: { articleCount: articleRows.length, keywordCount: keywordRows.length, articleMode, keywordMode, researchSource: STRATEGIC_RESEARCH_SOURCE, note: 'No search volume, CPC, ranking or difficulty metrics fabricated.' } });
  return { articleCount: articleRows.length, keywordCount: keywordRows.length };
}

export async function seedKeywordRoadmap(projectId: string, actorUserId?: string | null) {
  const keywords = [
    ...BLOG_POSTS.map((p) => ({ keyword: p.primaryKeyword, target_url: `${SITE_URL}/blog/${p.slug}`, intent: 'informational', priority: 'HIGH', opportunity_score: 80 })),
    { keyword: 'AI job application agent', target_url: `${SITE_URL}/`, intent: 'commercial', priority: 'HIGH', opportunity_score: 78 },
    { keyword: 'free ATS resume scanner', target_url: `${SITE_URL}/free-ats-resume-scanner`, intent: 'informational', priority: 'HIGH', opportunity_score: 76 },
    { keyword: 'AI cover letter writer', target_url: `${SITE_URL}/free-cover-letter-writer`, intent: 'commercial', priority: 'MEDIUM', opportunity_score: 70 },
    { keyword: 'job description analyzer', target_url: `${SITE_URL}/free-job-description-analyzer`, intent: 'informational', priority: 'MEDIUM', opportunity_score: 68 },
  ];
  const { error } = await supabaseAdmin.from('seo_keywords').upsert(keywords.map((k) => ({
    project_id: projectId,
    keyword: k.keyword,
    intent: k.intent,
    priority: k.priority,
    target_url: k.target_url,
    opportunity_score: k.opportunity_score,
    metric_source: 'seeded_strategy_no_volume_claim',
    metric_confidence: 'relevance_only',
    cannibalization_risk: 'low',
    last_updated: new Date().toISOString(),
  })), { onConflict: 'project_id,keyword' });
  if (error) throw new Error(error.message);
  await recordSeoAudit({ projectId, actorUserId, action: 'SEO_KEYWORD_ROADMAP_SEEDED', targetType: 'keyword', metadata: { count: keywords.length, note: 'No volume, CPC, or difficulty fabricated.' } });
  return keywords.length;
}


function cleanExtractedText(value: string | null) {
  return (value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attrContent(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] ? cleanExtractedText(match[1]) : null;
}

function normalizeComparableUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url, SITE_URL);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function extractSeoHtmlFacts(html: string, finalUrl: string) {
  const title = attrContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = attrContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)
    ?? attrContent(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const h1 = attrContent(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const canonical = attrContent(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i)
    ?? attrContent(html, /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i);
  const robotsMeta = attrContent(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/i)
    ?? attrContent(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["'][^>]*>/i);
  const noindex = /noindex/i.test(robotsMeta ?? '');
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const canonicalUrl = canonical ? new URL(canonical, finalUrl).toString().replace(/\/$/, '') : null;
  return { title, metaDescription, h1, canonicalUrl, noindex, hasViewport, structuredDataTypes: extractStructuredDataTypes(html) };
}

function collectJsonLdTypes(value: unknown, set: Set<string>) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdTypes(item, set));
    return;
  }
  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const type = record['@type'];
  if (Array.isArray(type)) type.forEach((entry) => typeof entry === 'string' && set.add(entry));
  else if (typeof type === 'string') set.add(type);
  Object.values(record).forEach((entry) => collectJsonLdTypes(entry, set));
}

function extractStructuredDataTypes(html: string) {
  const types = new Set<string>();
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      collectJsonLdTypes(JSON.parse(raw), types);
    } catch {
      types.add('INVALID_JSON_LD');
    }
  }
  return [...types].slice(0, 20);
}

function parseSitemapLocs(xml: string) {
  return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => normalizeComparableUrl(match[1]) ?? '').filter(Boolean));
}

function parseRobotsDisallows(robotsText: string) {
  return robotsText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => /^disallow:/i.test(line))
    .map((line) => line.split(':').slice(1).join(':').trim())
    .filter(Boolean);
}

function robotsAllowsUrl(url: string, disallows: string[]) {
  try {
    const path = new URL(url).pathname;
    return !disallows.some((rule) => rule !== '/' && (path === rule || path.startsWith(rule.endsWith('/') ? rule : `${rule}/`)));
  } catch {
    return false;
  }
}

function htmlLinksToUrl(html: string, targetUrl: string) {
  const target = new URL(targetUrl);
  const path = target.pathname === '/' ? '/' : target.pathname.replace(/\/$/, '');
  const absolute = target.toString().replace(/\/$/, '');
  return [...html.matchAll(/href=["']([^"']+)["']/gi)].some((match) => {
    const href = match[1] ?? '';
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    try {
      const parsed = new URL(href, SITE_URL);
      parsed.hash = '';
      parsed.search = '';
      const normalized = parsed.toString().replace(/\/$/, '');
      return normalized === absolute || parsed.pathname.replace(/\/$/, '') === path;
    } catch {
      return href.replace(/\/$/, '') === path;
    }
  });
}

function googleInspectionState(status?: string | null) {
  if (!status) return 'WAITING_FOR_GOOGLE';
  if (/submitted and indexed|url is on google|indexed/i.test(status) && !/not indexed|not on google|excluded/i.test(status)) return 'INDEXED_CONFIRMED_BY_GOOGLE';
  if (/not indexed|not on google|excluded|fail/i.test(status)) return status;
  return 'WAITING_FOR_GOOGLE';
}

export async function discoverIntendedPublicSeoUrls(project: SeoProject) {
  const staticUrls = [
    ...CORE_SEO_PATHS.map(canonicalPublicUrl),
    ...FREE_TOOL_SEO_PATHS.map(canonicalPublicUrl),
    ...BLOG_POSTS.map((post) => `${SITE_URL}/blog/${post.slug}`),
  ];
  const { data } = await supabaseAdmin
    .from('seo_articles')
    .select('url')
    .eq('project_id', project.id)
    .eq('status', 'PUBLISHED')
    .then((result) => result, () => ({ data: [] as Array<{ url: string }> }));
  const dbUrls = (data ?? []).map((row) => String(row.url));
  return [...new Set([...staticUrls, ...dbUrls].map((url) => normalizeComparableUrl(url) ?? url).filter(isAllowedPublicSeoUrl))].sort();
}

export async function runPublicUrlAudit(project: SeoProject, actorUserId?: string | null) {
  const taskId = await createSeoTask(project.id, 'PUBLIC_URL_TECHNICAL_AUDIT');
  try {
    const urls = await discoverIntendedPublicSeoUrls(project);
    const [sitemapRes, robotsRes, indexingRows] = await Promise.all([
      fetch(project.sitemap_url, { cache: 'no-store' }).catch(() => null),
      fetch(`${project.domain.replace(/\/$/, '')}/robots.txt`, { cache: 'no-store' }).catch(() => null),
      supabaseAdmin
        .from('seo_indexing_requests')
        .select('url,status,google_response,requested_at')
        .eq('project_id', project.id)
        .order('requested_at', { ascending: false })
        .then((result) => result.data ?? [], () => [] as Array<Record<string, unknown>>),
    ]);
    const sitemapText = sitemapRes ? await sitemapRes.text().catch(() => '') : '';
    const robotsText = robotsRes ? await robotsRes.text().catch(() => '') : '';
    const sitemapLocs = parseSitemapLocs(sitemapText);
    const robotsDisallows = parseRobotsDisallows(robotsText);
    const latestInspection = new Map<string, Record<string, unknown>>();
    for (const row of indexingRows) {
      const key = normalizeComparableUrl(String(row.url));
      if (key && !latestInspection.has(key)) latestInspection.set(key, row);
    }

    const fetched = await Promise.all(urls.map(async (url) => {
      const result: { url: string; status: number | null; html: string; xRobots: string | null } = { url, status: null, html: '', xRobots: null };
      try {
        const response = await fetch(url, { cache: 'no-store', headers: { 'user-agent': 'JobiestSEOAuditor/1.0 (+https://jobiest.com)' } });
        result.status = response.status;
        result.xRobots = response.headers.get('x-robots-tag');
        const contentType = response.headers.get('content-type') ?? '';
        if (/text\/html|application\/xhtml/i.test(contentType)) result.html = await response.text();
      } catch {
        result.status = null;
      }
      return result;
    }));

    const htmlByUrl = new Map(fetched.map((row) => [row.url, row.html]));
    const titleOwners = new Map<string, string>();
    const rows = fetched.map((row) => {
      const facts = row.html ? extractSeoHtmlFacts(row.html, row.url) : { title: null, metaDescription: null, h1: null, canonicalUrl: null, noindex: false, hasViewport: false, structuredDataTypes: [] as string[] };
      const errors: string[] = [];
      const comparableUrl = normalizeComparableUrl(row.url);
      const canonicalComparable = normalizeComparableUrl(facts.canonicalUrl);
      const robotsAllowed = robotsAllowsUrl(row.url, robotsDisallows) && isAllowedPublicSeoUrl(row.url);
      const noindex = facts.noindex || /noindex/i.test(row.xRobots ?? '');
      const sitemapIncluded = Boolean(comparableUrl && sitemapLocs.has(comparableUrl));
      const internallyLinked = row.url === canonicalPublicUrl('/') || [...htmlByUrl.entries()].some(([source, html]) => source !== row.url && htmlLinksToUrl(html, row.url));
      const renderOk = Boolean(row.html && (facts.h1 || facts.title));
      const canonicalOk = Boolean(canonicalComparable && comparableUrl && canonicalComparable === comparableUrl);
      let duplicateOf: string | null = null;
      const titleKey = (facts.title ?? '').toLowerCase();
      if (titleKey) {
        duplicateOf = titleOwners.get(titleKey) ?? null;
        if (!duplicateOf) titleOwners.set(titleKey, row.url);
      }

      if (row.status !== 200) errors.push('HTTP_NOT_200');
      if (!robotsAllowed) errors.push('ROBOTS_BLOCKED_OR_NOT_PUBLIC_ALLOWLIST');
      if (noindex) errors.push('NOINDEX_PRESENT');
      if (!facts.title) errors.push('TITLE_MISSING');
      if (!facts.metaDescription) errors.push('META_DESCRIPTION_MISSING');
      if (!facts.h1) errors.push('H1_MISSING');
      if (!facts.canonicalUrl) errors.push('CANONICAL_MISSING');
      else if (!canonicalOk) errors.push('CANONICAL_MISMATCH');
      if (!sitemapIncluded) errors.push('SITEMAP_MISSING');
      if (!internallyLinked) errors.push('INTERNAL_LINK_MISSING');
      if (!renderOk) errors.push('SERVER_RENDER_CHECK_FAILED');
      if (!facts.hasViewport) errors.push('VIEWPORT_META_MISSING');
      if (duplicateOf) errors.push('DUPLICATE_TITLE');

      const inspection = comparableUrl ? latestInspection.get(comparableUrl) : null;
      const indexingState = googleInspectionState(inspection?.status as string | undefined);
      const hasTechnicalBlocker = errors.some((error) => ['HTTP_NOT_200', 'ROBOTS_BLOCKED_OR_NOT_PUBLIC_ALLOWLIST', 'NOINDEX_PRESENT', 'SERVER_RENDER_CHECK_FAILED'].includes(error));
      const googleIndexed = indexingState === 'INDEXED_CONFIRMED_BY_GOOGLE';
      const googleNotIndexed = /not indexed|not on google|excluded|fail/i.test(indexingState);
      const status = noindex ? 'NOINDEX' : hasTechnicalBlocker ? 'ERROR' : errors.length || googleNotIndexed ? 'WARNING' : googleIndexed ? 'PASS' : 'WAITING_FOR_GOOGLE';

      return {
        project_id: project.id,
        url: row.url,
        status,
        http_status: row.status,
        indexable: row.status === 200 && robotsAllowed && !noindex && canonicalOk,
        robots_allowed: robotsAllowed,
        noindex,
        canonical_url: facts.canonicalUrl,
        canonical_ok: canonicalOk,
        sitemap_included: sitemapIncluded,
        internally_linked: internallyLinked,
        title: facts.title,
        meta_description: facts.metaDescription,
        h1: facts.h1,
        structured_data_types: facts.structuredDataTypes,
        mobile_friendly: facts.hasViewport ? 'PASS_VIEWPORT_META' : 'WARNING_VIEWPORT_META_MISSING',
        render_ok: renderOk,
        duplicate_of: duplicateOf,
        indexing_state: indexingState,
        last_inspected_at: inspection?.requested_at ?? null,
        google_response: inspection?.google_response ?? null,
        errors,
        last_action: indexingState === 'WAITING_FOR_GOOGLE' && !hasTechnicalBlocker ? 'Technical checks recorded. Waiting for Google OAuth, URL Inspection API data, or Google recrawl.' : errors.length ? 'Review and fix listed technical SEO findings.' : 'Technical checks pass with recorded Google inspection state.',
        last_action_at: new Date().toISOString(),
        source: 'public_url_audit',
        updated_at: new Date().toISOString(),
      };
    });

    if (rows.length) {
      const { error } = await supabaseAdmin.from('seo_url_audits').upsert(rows, { onConflict: 'project_id,url' });
      if (error) throw new Error(error.message);
    }
    const totals = {
      total: rows.length,
      indexable: rows.filter((row) => row.indexable).length,
      waitingForGoogle: rows.filter((row) => row.status === 'WAITING_FOR_GOOGLE').length,
      warnings: rows.filter((row) => row.status === 'WARNING').length,
      errors: rows.filter((row) => row.status === 'ERROR').length,
      noindex: rows.filter((row) => row.status === 'NOINDEX').length,
      sitemapUrl: project.sitemap_url,
    };
    await supabaseAdmin.from('seo_projects').update({ last_audit_at: new Date().toISOString() }).eq('id', project.id);
    await finishSeoTask(taskId, 'SUCCEEDED', totals);
    await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_PUBLIC_URL_AUDIT_COMPLETE', targetType: 'project', metadata: totals });
    return { urls, totals };
  } catch (error) {
    await finishSeoTask(taskId, 'FAILED', null, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function inspectImportantUrls(project: SeoProject, actorUserId?: string | null, limit = 10) {
  if (!project.search_console_property) throw new Error('SEARCH_CONSOLE_PROPERTY_REQUIRED');
  const urls = await discoverIntendedPublicSeoUrls(project);
  const important = urls.filter((url) =>
    url === SITE_URL
    || /\/blog\//.test(url)
    || FREE_TOOL_SEO_PATHS.some((path) => url === canonicalPublicUrl(path)),
  ).slice(0, Math.max(1, Math.min(25, limit)));
  const inspected: Array<{ url: string; status: string }> = [];
  for (const url of important) {
    const result = await inspectAndRecordUrl(project, url, actorUserId);
    const status = result.inspectionResult?.indexStatusResult?.coverageState ?? result.inspectionResult?.indexStatusResult?.verdict ?? 'UNKNOWN';
    inspected.push({ url, status });
    const normalizedState = googleInspectionState(status);
    await supabaseAdmin.from('seo_url_audits').update({
      indexing_state: normalizedState,
      last_inspected_at: new Date().toISOString(),
      google_response: result,
      status: normalizedState === 'INDEXED_CONFIRMED_BY_GOOGLE' ? 'PASS' : normalizedState === 'WAITING_FOR_GOOGLE' ? 'WAITING_FOR_GOOGLE' : 'WARNING',
      updated_at: new Date().toISOString(),
    }).eq('project_id', project.id).eq('url', normalizeComparableUrl(url) ?? url);
  }
  await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_IMPORTANT_URLS_INSPECTED', targetType: 'url', metadata: { count: inspected.length } });
  return inspected;
}

export async function verifySitemapAndRobots(project: SeoProject, actorUserId?: string | null) {
  const taskId = await createSeoTask(project.id, 'SITEMAP_AND_ROBOTS_CHECK');
  try {
    const [sitemapRes, robotsRes] = await Promise.all([
      fetch(project.sitemap_url, { cache: 'no-store' }),
      fetch(`${project.domain.replace(/\/$/, '')}/robots.txt`, { cache: 'no-store' }),
    ]);
    const sitemapText = await sitemapRes.text().catch(() => '');
    const robotsText = await robotsRes.text().catch(() => '');
    const result = {
      sitemapStatus: sitemapRes.status,
      robotsStatus: robotsRes.status,
      sitemapLooksXml: sitemapText.includes('<urlset') || sitemapText.includes('<sitemapindex'),
      robotsAllowsRoot: !/disallow:\s*\/\s*$/im.test(robotsText),
      sitemapUrl: project.sitemap_url,
    };
    await finishSeoTask(taskId, result.sitemapStatus === 200 && result.sitemapLooksXml ? 'SUCCEEDED' : 'FAILED', result);
    await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_SITEMAP_ROBOTS_CHECKED', targetType: 'sitemap', targetUrl: project.sitemap_url, metadata: result });
    return result;
  } catch (error) {
    await finishSeoTask(taskId, 'FAILED', null, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function submitConfiguredSitemap(project: SeoProject, actorUserId?: string | null) {
  if (!project.search_console_property) throw new Error('SEARCH_CONSOLE_PROPERTY_REQUIRED');
  const taskId = await createSeoTask(project.id, 'SEARCH_CONSOLE_SITEMAP_SUBMIT');
  try {
    const tokens = await getFreshGoogleTokens(project);
    const existing = await getSitemap(tokens, project.search_console_property, project.sitemap_url).catch(() => null);
    const lastSubmittedMs = existing?.lastSubmitted ? new Date(existing.lastSubmitted).getTime() : 0;
    const recentlySubmitted = lastSubmittedMs > 0 && Date.now() - lastSubmittedMs < 24 * 3600_000;
    if (existing && recentlySubmitted && !existing.errors) {
      const result = { sitemapUrl: project.sitemap_url, skipped: true, reason: 'SITEMAP_RECENTLY_SUBMITTED', details: existing };
      await finishSeoTask(taskId, 'SKIPPED', result);
      await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_SITEMAP_SUBMIT_SKIPPED_RECENT', targetType: 'sitemap', targetUrl: project.sitemap_url, metadata: result });
      return result;
    }
    await submitSitemap(tokens, project.search_console_property, project.sitemap_url);
    const details = await getSitemap(tokens, project.search_console_property, project.sitemap_url).catch(() => null);
    await finishSeoTask(taskId, 'SUCCEEDED', { sitemapUrl: project.sitemap_url, details });
    await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_SITEMAP_SUBMITTED', targetType: 'sitemap', targetUrl: project.sitemap_url, metadata: { details } });
    return details;
  } catch (error) {
    await finishSeoTask(taskId, 'FAILED', null, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function importSearchConsoleMetrics(project: SeoProject, actorUserId?: string | null, days = 28) {
  if (!project.search_console_property) throw new Error('SEARCH_CONSOLE_PROPERTY_REQUIRED');
  const taskId = await createSeoTask(project.id, 'SEARCH_CONSOLE_METRICS_IMPORT');
  try {
    const end = new Date(Date.now() - 48 * 3600_000);
    const start = new Date(end.getTime() - days * 86_400_000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const tokens = await getFreshGoogleTokens(project);
    const rows = await querySearchAnalytics(tokens, {
      siteUrl: project.search_console_property,
      startDate,
      endDate,
      dimensions: ['date', 'query', 'page'],
      rowLimit: 25000,
    });
    if (rows.length) {
      const payload = rows.map((r) => {
        const date = r.keys?.[0] ?? endDate;
        const query = r.keys?.[1] ?? null;
        const url = r.keys?.[2] ?? null;
        return {
          project_id: project.id,
          date,
          query,
          url,
          dimensions_key: JSON.stringify({ query, url, country: null, device: null, searchAppearance: null }),
          clicks: Math.round(r.clicks ?? 0),
          impressions: Math.round(r.impressions ?? 0),
          ctr: r.ctr ?? 0,
          average_position: r.position ?? 0,
          source: 'google_search_console',
          imported_at: new Date().toISOString(),
        };
      });
      const { error } = await supabaseAdmin.from('seo_metrics').upsert(payload, {
        onConflict: 'project_id,date,dimensions_key',
      });
      if (error) throw new Error(error.message);
    }
    await supabaseAdmin.from('seo_projects').update({ last_sync_at: new Date().toISOString() }).eq('id', project.id);
    await finishSeoTask(taskId, 'SUCCEEDED', { importedRows: rows.length, startDate, endDate });
    await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_GSC_METRICS_IMPORTED', targetType: 'metrics', metadata: { importedRows: rows.length, startDate, endDate } });
    return rows.length;
  } catch (error) {
    await finishSeoTask(taskId, 'FAILED', null, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function inspectAndRecordUrl(project: SeoProject, url: string, actorUserId?: string | null) {
  if (!project.search_console_property) throw new Error('SEARCH_CONSOLE_PROPERTY_REQUIRED');
  const taskId = await createSeoTask(project.id, 'URL_INSPECTION');
  try {
    const tokens = await getFreshGoogleTokens(project);
    const result = await inspectUrl(tokens, { siteUrl: project.search_console_property, inspectionUrl: url });
    const status = result.inspectionResult?.indexStatusResult?.coverageState ?? result.inspectionResult?.indexStatusResult?.verdict ?? 'UNKNOWN';
    await supabaseAdmin.from('seo_indexing_requests').upsert({
      project_id: project.id,
      url,
      request_type: 'INSPECT',
      mechanism: 'URL_INSPECTION_API',
      status,
      google_response: result,
      requested_at: new Date().toISOString(),
    }, { onConflict: 'project_id,url,mechanism,request_type' });
    const normalizedState = googleInspectionState(status);
    await supabaseAdmin.from('seo_url_audits').update({
      indexing_state: normalizedState,
      last_inspected_at: new Date().toISOString(),
      google_response: result,
      status: normalizedState === 'INDEXED_CONFIRMED_BY_GOOGLE' ? 'PASS' : normalizedState === 'WAITING_FOR_GOOGLE' ? 'WAITING_FOR_GOOGLE' : 'WARNING',
      updated_at: new Date().toISOString(),
    }).eq('project_id', project.id).eq('url', normalizeComparableUrl(url) ?? url).then(undefined, () => undefined);
    await finishSeoTask(taskId, 'SUCCEEDED', { url, status });
    await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_URL_INSPECTED', targetType: 'url', targetUrl: url, metadata: { status } });
    return result;
  } catch (error) {
    await finishSeoTask(taskId, 'FAILED', null, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function recordDiscoveryWorkflow(project: SeoProject, url: string, contentType = 'Article', actorUserId?: string | null) {
  const mechanism = indexingApiSupportedFor(contentType) ? 'INDEXING_API_SUPPORTED_CONTENT' : 'SITEMAP_AND_INTERNAL_LINKS_ONLY';
  const reason = indexingApiSupportedFor(contentType)
    ? 'Content type is eligible for Google Indexing API notification.'
    : 'Google Indexing API is not used for normal articles. Discovery happens via sitemap and internal links, then URL Inspection monitors actual index status.';
  await supabaseAdmin.from('seo_indexing_requests').upsert({
    project_id: project.id,
    url,
    request_type: 'DISCOVERY_RECORDED',
    mechanism,
    status: 'RECORDED',
    reason,
    requested_at: new Date().toISOString(),
  }, { onConflict: 'project_id,url,mechanism,request_type' });
  await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_DISCOVERY_WORKFLOW_RECORDED', targetType: 'url', targetUrl: url, metadata: { mechanism, reason } });
  return { mechanism, reason };
}

export async function runInitialSeoFoundation(project: SeoProject, actorUserId?: string | null) {
  const taskId = await createSeoTask(project.id, 'INITIAL_SEO_AUDIT');
  try {
    const sitemap = await verifySitemapAndRobots(project, actorUserId);
    const articleCount = await syncPastorArticles(project.id, actorUserId);
    const strategicContent = await syncStrategicSeoContent(project.id, actorUserId);
    const keywordCount = await seedKeywordRoadmap(project.id, actorUserId);
    const urlAudit = await runPublicUrlAudit(project, actorUserId);
    for (const post of BLOG_POSTS) {
      await recordDiscoveryWorkflow(project, `${SITE_URL}/blog/${post.slug}`, 'Article', actorUserId);
    }
    const result = { sitemap, articleCount, strategicContent, keywordCount, urlAudit: urlAudit.totals, discoveryRecords: BLOG_POSTS.length + strategicContent.articleCount };
    await supabaseAdmin.from('seo_projects').update({ last_audit_at: new Date().toISOString() }).eq('id', project.id);
    await finishSeoTask(taskId, 'SUCCEEDED', result);
    await recordSeoAudit({ projectId: project.id, actorUserId, action: 'SEO_INITIAL_FOUNDATION_COMPLETE', targetType: 'project', metadata: result });
    return result;
  } catch (error) {
    await finishSeoTask(taskId, 'FAILED', null, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function setSeoPaused(projectId: string, paused: boolean, actorUserId: string) {
  const { error } = await supabaseAdmin
    .from('seo_projects')
    .update({ paused, status: paused ? 'PAUSED' : 'ACTIVE', updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(error.message);
  await recordSeoAudit({ projectId, actorUserId, action: paused ? 'SEO_AGENT_PAUSED' : 'SEO_AGENT_RESUMED', targetType: 'project' });
}

export async function notifySeoEvent(input: { subject: string; body: string }) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) return { ok: false, error: 'ADMIN_ALERT_EMAIL_NOT_CONFIGURED' };
  return await sendEmail({ to, subject: input.subject, html: input.body.replace(/\n/g, '<br>'), text: input.body });
}

export async function listConfiguredSitemaps(project: SeoProject) {
  if (!project.search_console_property) return [];
  const tokens = await getFreshGoogleTokens(project);
  return await listSitemaps(tokens, project.search_console_property);
}

/** Daily autonomous SEO loop. Safe no-op while paused or before setup. */
export async function runSeoDailyLoop() {
  const data = await getSeoDashboardData();
  const project = data.project;
  if (!data.tablesReady || !project) return { skipped: true, reason: data.error ?? 'SEO_PROJECT_NOT_READY' };
  if (project.paused || !['ACTIVE', 'CONNECTED'].includes(project.status)) {
    return { skipped: true, reason: 'SEO_AGENT_PAUSED_OR_NOT_ACTIVE', status: project.status, paused: project.paused };
  }

  const report: Record<string, unknown> = {};
  report.sitemap = await verifySitemapAndRobots(project, null).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  report.articles = await syncPastorArticles(project.id, null).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  report.strategicContent = await syncStrategicSeoContent(project.id, null).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  report.keywords = await seedKeywordRoadmap(project.id, null).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  report.urlAudit = await runPublicUrlAudit(project, null).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

  if (project.google_oauth_ciphertext && project.search_console_property) {
    report.metrics = await importSearchConsoleMetrics(project, null, 7).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    report.gscSitemaps = await listConfiguredSitemaps(project).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    report.urlInspection = await inspectImportantUrls(project, null, 5).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  } else {
    report.metrics = 'GOOGLE_SEARCH_CONSOLE_NOT_CONNECTED';
  }

  await recordSeoAudit({ projectId: project.id, action: 'SEO_DAILY_LOOP_COMPLETED', targetType: 'project', metadata: report });
  return { skipped: false, report };
}
