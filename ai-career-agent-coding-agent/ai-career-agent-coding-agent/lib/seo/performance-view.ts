/**
 * Admin SEO panel view helpers (Master Upgrade Workstream A, A11.2-A11.4).
 *
 * Pure functions mapping database rows to display fields, following the
 * keyword-view.ts pattern: no network access, fully unit-testable.
 *
 * Honesty rules (spec A11.3): data is sourced exclusively from Google Search
 * Console; nothing is fabricated. When a metric cannot be computed from real
 * data the view carries an explicit "Data not available" reason instead of a
 * placeholder number. GSC data and website analytics data are never mixed.
 */

export interface SeoMetricRow {
  date: string;
  url: string | null;
  query: string | null;
  country: string | null;
  device: string | null;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  average_position: number | string | null;
}

export interface DailyMetricPoint {
  date: string;
  clicks: number;
  impressions: number;
}

export interface QueryBreakdownRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: string;
  averagePosition: string;
}

export interface DimensionBreakdownRow {
  label: string;
  clicks: number;
  impressions: number;
  share: string;
}

export interface SearchPerformanceView {
  available: boolean;
  unavailableReason: string;
  dateRange: { from: string; to: string } | null;
  daily: DailyMetricPoint[];
  totals: { clicks: number; impressions: number; ctr: string; averagePosition: string };
  topQueries: QueryBreakdownRow[];
  topQueriesAvailable: boolean;
  country: DimensionBreakdownRow[];
  countryAvailable: boolean;
  device: DimensionBreakdownRow[];
  deviceAvailable: boolean;
  sourceLabel: string;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/** Build the A11.3 Search Performance panel from raw seo_metrics rows. */
export function buildSearchPerformanceView(metrics: SeoMetricRow[]): SearchPerformanceView {
  const sourceLabel = 'Google Search Console (imported rows only; nothing estimated)';
  if (!metrics.length) {
    return {
      available: false,
      unavailableReason: 'No Google Search Console metrics imported yet. Use "Import GSC Metrics" after connecting Search Console.',
      dateRange: null,
      daily: [],
      totals: { clicks: 0, impressions: 0, ctr: '0%', averagePosition: 'Unavailable' },
      topQueries: [],
      topQueriesAvailable: false,
      country: [],
      countryAvailable: false,
      device: [],
      deviceAvailable: false,
      sourceLabel,
    };
  }

  const byDate = new Map<string, DailyMetricPoint>();
  const byQuery = new Map<string, { clicks: number; impressions: number; positionWeighted: number }>();
  const byCountry = new Map<string, { clicks: number; impressions: number }>();
  const byDevice = new Map<string, { clicks: number; impressions: number }>();
  let totalClicks = 0;
  let totalImpressions = 0;
  let positionWeighted = 0;

  for (const row of metrics) {
    const date = String(row.date ?? '').slice(0, 10);
    const clicks = num(row.clicks);
    const impressions = num(row.impressions);
    const position = num(row.average_position);
    if (!date) continue;

    totalClicks += clicks;
    totalImpressions += impressions;
    positionWeighted += position * impressions;

    const day = byDate.get(date) ?? { date, clicks: 0, impressions: 0 };
    day.clicks += clicks;
    day.impressions += impressions;
    byDate.set(date, day);

    // Dimension rows overlap with date rows only when the importer wrote them;
    // query/country/device aggregation keys on non-null values so totals stay
    // per-dimension (a query row is never double counted as a country row).
    if (row.query) {
      const q = byQuery.get(row.query) ?? { clicks: 0, impressions: 0, positionWeighted: 0 };
      q.clicks += clicks;
      q.impressions += impressions;
      q.positionWeighted += position * impressions;
      byQuery.set(row.query, q);
    }
    if (row.country) {
      const c = byCountry.get(row.country) ?? { clicks: 0, impressions: 0 };
      c.clicks += clicks;
      c.impressions += impressions;
      byCountry.set(row.country, c);
    }
    if (row.device) {
      const d = byDevice.get(row.device) ?? { clicks: 0, impressions: 0 };
      d.clicks += clicks;
      d.impressions += impressions;
      byDevice.set(row.device, d);
    }
  }

  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const dates = daily.map((d) => d.date);

  const topQueries = [...byQuery.entries()]
    .map(([query, v]) => ({
      query,
      clicks: v.clicks,
      impressions: v.impressions,
      ctr: v.impressions ? pct(v.clicks / v.impressions) : '0%',
      averagePosition: v.impressions ? (v.positionWeighted / v.impressions).toFixed(1) : 'Unavailable',
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 15);

  const toBreakdown = (map: Map<string, { clicks: number; impressions: number }>): DimensionBreakdownRow[] => {
    const impressionsTotal = [...map.values()].reduce((acc, v) => acc + v.impressions, 0);
    return [...map.entries()]
      .map(([label, v]) => ({ label, clicks: v.clicks, impressions: v.impressions, share: impressionsTotal ? pct(v.impressions / impressionsTotal) : '0%' }))
      .sort((a, b) => b.impressions - a.impressions);
  };

  return {
    available: true,
    unavailableReason: '',
    dateRange: { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' },
    daily,
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions ? pct(totalClicks / totalImpressions) : '0%',
      averagePosition: totalImpressions ? (positionWeighted / totalImpressions).toFixed(1) : 'Unavailable',
    },
    topQueries,
    topQueriesAvailable: topQueries.length > 0,
    country: toBreakdown(byCountry),
    countryAvailable: byCountry.size > 0,
    device: toBreakdown(byDevice),
    deviceAvailable: byDevice.size > 0,
    sourceLabel,
  };
}

export interface TrendChartBar {
  date: string;
  x: number;
  barWidth: number;
  clicksHeight: number;
  impressionsHeight: number;
}

/** Map a daily series to bar chart geometry (pure, server-renderable SVG). */
export function trendChartPoints(daily: DailyMetricPoint[], width: number, height: number, barGap: number): TrendChartBar[] {
  if (!daily.length || width <= 0 || height <= 0) return [];
  const maxImpressions = Math.max(...daily.map((d) => d.impressions), 1);
  const slot = width / daily.length;
  const barWidth = Math.max(2, Math.floor(slot - barGap));
  return daily.map((d, i) => ({
    date: d.date,
    x: Math.round(i * slot + (slot - barWidth) / 2),
    barWidth,
    clicksHeight: d.clicks > 0 ? Math.max(1, Math.round((d.clicks / maxImpressions) * height)) : 0,
    impressionsHeight: d.impressions > 0 ? Math.max(1, Math.round((d.impressions / maxImpressions) * height)) : 0,
  }));
}

export interface SeoConversionEventRow {
  event_name: string;
  user_id: string | null;
  article_slug: string | null;
  tool_id: string | null;
  created_at: string;
}

export interface ConversionPanelView {
  sourceLabel: string;
  analyticsPropertyConnected: false;
  organicSessions: { available: false; reason: string };
  signupStarts: { available: false; reason: string };
  completedRegistrations: { available: true; fromArticles: number; fromTools: number; total: number; distinctUsers: number };
  organicToSignupRate: { available: false; reason: string };
  eventCounts: { event: string; count: number; lastAt: string }[];
}

/** Build the A11.4 Conversion panel. Sessions/starts/rate are honestly unavailable without an analytics property. */
export function buildConversionPanelView(events: SeoConversionEventRow[]): ConversionPanelView {
  const counts = new Map<string, { count: number; lastAt: string }>();
  const users = new Set<string>();
  let fromArticles = 0;
  let fromTools = 0;

  for (const event of events) {
    const name = String(event.event_name ?? '');
    if (!name) continue;
    const entry = counts.get(name) ?? { count: 0, lastAt: '' };
    entry.count += 1;
    const at = String(event.created_at ?? '');
    if (at > entry.lastAt) entry.lastAt = at;
    counts.set(name, entry);
    if (event.user_id) users.add(event.user_id);
    if (name === 'signup_created_from_article') fromArticles += 1;
    if (name === 'signup_created_from_tool') fromTools += 1;
  }

  return {
    sourceLabel: 'Jobiest first-party events (seo_conversion_events). Website analytics data, kept strictly separate from Google Search Console data.',
    analyticsPropertyConnected: false,
    organicSessions: { available: false, reason: 'Data not available: no analytics property (GA or similar) is connected. Search Console impressions are search results, not site sessions, and are never used as a substitute.' },
    signupStarts: { available: false, reason: 'Data not available: no signup-start event is tracked. Connect an analytics property or add the event before this number can exist.' },
    completedRegistrations: { available: true, fromArticles, fromTools, total: fromArticles + fromTools, distinctUsers: users.size },
    organicToSignupRate: { available: false, reason: 'Data not available: the rate needs organic sessions from an analytics property. Mixing Search Console clicks with first-party signups would produce a misleading number.' },
    eventCounts: [...counts.entries()]
      .map(([event, v]) => ({ event, count: v.count, lastAt: v.lastAt.slice(0, 10) }))
      .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event)),
  };
}

export interface SeoArticleRow {
  title: string | null;
  slug: string | null;
  url: string | null;
  target_keyword: string | null;
  status: string | null;
  published_at: string | null;
  internal_links: unknown;
  quality_report: unknown;
  indexing_status: string | null;
}

export interface SeoUrlAuditRow {
  url: string | null;
  indexing_state: string | null;
  sitemap_included: boolean | null;
  status: string | null;
}

export interface ContentInventoryRow {
  title: string;
  url: string;
  primaryKeyword: string;
  status: string;
  publicationDate: string;
  gscIndexingStatus: string;
  internalLinksCount: number | null;
  seoAuditStatus: string;
}

/** Build the A11.2 Content Management panel from seo_articles + seo_url_audits rows. */
export function buildContentInventoryView(articles: SeoArticleRow[], urlAudits: SeoUrlAuditRow[]): ContentInventoryRow[] {
  const auditByUrl = new Map<string, SeoUrlAuditRow>();
  for (const audit of urlAudits) {
    if (audit.url) auditByUrl.set(audit.url, audit);
  }

  return articles.map((article) => {
    const url = String(article.url ?? '');
    const audit = auditByUrl.get(url);
    const internalLinks = Array.isArray(article.internal_links) ? article.internal_links.length : null;
    const quality = (article.quality_report ?? {}) as { gate?: string; status?: string };
    return {
      title: String(article.title ?? '-'),
      url,
      primaryKeyword: String(article.target_keyword ?? 'Unknown'),
      status: String(article.status ?? 'Unknown'),
      publicationDate: article.published_at ? String(article.published_at).slice(0, 10) : 'Unknown',
      gscIndexingStatus: audit?.indexing_state ? String(audit.indexing_state) : String(article.indexing_status ?? 'Not inspected yet'),
      internalLinksCount: internalLinks,
      seoAuditStatus: quality.gate ? String(quality.gate) : quality.status ? String(quality.status) : 'Not run',
    };
  });
}
