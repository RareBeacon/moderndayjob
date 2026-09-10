import { supabaseAdmin } from '@/lib/supabase';
import { SITE_URL } from '@/lib/site';
import { BLOG_POSTS } from '@/lib/seo/blog';
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
  tablesReady: boolean;
  error?: string;
}

export function seoTablesMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  return /seo_projects|seo_articles|schema cache|does not exist|relation .*seo_/i.test(msg ?? '');
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
    if (!project) return { project: null, articles: [], keywords: [], metrics: [], tasks: [], logs: [], indexing: [], tablesReady: true };
    const [articles, keywords, metrics, tasks, logs, indexing] = await Promise.all([
      supabaseAdmin.from('seo_articles').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(30),
      supabaseAdmin.from('seo_keywords').select('*').eq('project_id', project.id).order('opportunity_score', { ascending: false, nullsFirst: false }).limit(50),
      supabaseAdmin.from('seo_metrics').select('*').eq('project_id', project.id).order('date', { ascending: false }).limit(50),
      supabaseAdmin.from('seo_agent_tasks').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('seo_audit_logs').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(30),
      supabaseAdmin.from('seo_indexing_requests').select('*').eq('project_id', project.id).order('requested_at', { ascending: false }).limit(30),
    ]);
    return {
      project,
      articles: articles.data ?? [],
      keywords: keywords.data ?? [],
      metrics: metrics.data ?? [],
      tasks: tasks.data ?? [],
      logs: logs.data ?? [],
      indexing: indexing.data ?? [],
      tablesReady: true,
    };
  } catch (error) {
    if (seoTablesMissing(error)) {
      return { project: null, articles: [], keywords: [], metrics: [], tasks: [], logs: [], indexing: [], tablesReady: false, error: 'SEO tables are not migrated yet.' };
    }
    return { project: null, articles: [], keywords: [], metrics: [], tasks: [], logs: [], indexing: [], tablesReady: false, error: error instanceof Error ? error.message : String(error) };
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
    const keywordCount = await seedKeywordRoadmap(project.id, actorUserId);
    for (const post of BLOG_POSTS) {
      await recordDiscoveryWorkflow(project, `${SITE_URL}/blog/${post.slug}`, 'Article', actorUserId);
    }
    const result = { sitemap, articleCount, keywordCount, discoveryRecords: BLOG_POSTS.length };
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
  report.keywords = await seedKeywordRoadmap(project.id, null).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

  if (project.google_oauth_ciphertext && project.search_console_property) {
    report.metrics = await importSearchConsoleMetrics(project, null, 7).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    report.gscSitemaps = await listConfiguredSitemaps(project).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  } else {
    report.metrics = 'GOOGLE_SEARCH_CONSOLE_NOT_CONNECTED';
  }

  await recordSeoAudit({ projectId: project.id, action: 'SEO_DAILY_LOOP_COMPLETED', targetType: 'project', metadata: report });
  return { skipped: false, report };
}
