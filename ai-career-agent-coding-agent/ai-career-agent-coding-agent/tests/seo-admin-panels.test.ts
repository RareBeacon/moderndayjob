import { describe, expect, it } from 'vitest';
import {
  buildContentInventoryView,
  buildConversionPanelView,
  buildSearchPerformanceView,
  trendChartPoints,
  type SeoArticleRow,
  type SeoConversionEventRow,
  type SeoMetricRow,
  type SeoUrlAuditRow,
} from '@/lib/seo/performance-view';

describe('A11.3 search performance view', () => {
  it('returns an honest unavailable state with reason when nothing is imported', () => {
    const view = buildSearchPerformanceView([]);
    expect(view.available).toBe(false);
    expect(view.unavailableReason).toContain('No Google Search Console metrics imported yet');
    expect(view.totals.averagePosition).toBe('Unavailable');
    expect(view.topQueriesAvailable).toBe(false);
    expect(view.countryAvailable).toBe(false);
    expect(view.deviceAvailable).toBe(false);
  });

  it('aggregates daily series, weighted position, CTR, and date range from mixed dimension rows', () => {
    const metrics: SeoMetricRow[] = [
      { date: '2026-09-10', url: '/blog/a', query: 'resume tips', country: null, device: null, clicks: 4, impressions: 100, ctr: 0.04, average_position: 12 },
      { date: '2026-09-10', url: '/blog/b', query: 'cover letter', country: null, device: null, clicks: 1, impressions: 50, ctr: 0.02, average_position: 20 },
      { date: '2026-09-11', url: '/blog/a', query: 'resume tips', country: null, device: null, clicks: 5, impressions: 200, ctr: 0.025, average_position: 8 },
      { date: '2026-09-11', url: null, query: null, country: 'NGA', device: null, clicks: 9, impressions: 300, ctr: 0.03, average_position: 10 },
      { date: '2026-09-11', url: null, query: null, country: null, device: 'MOBILE', clicks: 7, impressions: 250, ctr: 0.028, average_position: 11 },
    ];
    const view = buildSearchPerformanceView(metrics);
    expect(view.available).toBe(true);
    expect(view.dateRange).toEqual({ from: '2026-09-10', to: '2026-09-11' });
    // Daily trend aggregates across dimensions per date.
    expect(view.daily).toEqual([
      { date: '2026-09-10', clicks: 5, impressions: 150 },
      { date: '2026-09-11', clicks: 21, impressions: 750 },
    ]);
    // Totals: 26 clicks, 900 impressions, impression-weighted position.
    expect(view.totals.clicks).toBe(26);
    expect(view.totals.impressions).toBe(900);
    expect(view.totals.ctr).toBe('2.89%');
    expect(view.totals.averagePosition).toBe('10.6'); // (12*100 + 20*50 + 8*200 + 10*300 + 11*250) / 900
    // Top queries aggregate only query rows, sorted by clicks.
    expect(view.topQueries).toEqual([
      { query: 'resume tips', clicks: 9, impressions: 300, ctr: '3.00%', averagePosition: '9.3' },
      { query: 'cover letter', clicks: 1, impressions: 50, ctr: '2.00%', averagePosition: '20.0' },
    ]);
    expect(view.country).toEqual([{ label: 'NGA', clicks: 9, impressions: 300, share: '100.00%' }]);
    expect(view.device).toEqual([{ label: 'MOBILE', clicks: 7, impressions: 250, share: '100.00%' }]);
  });

  it('marks country and device unavailable when the importer has not populated those dimensions', () => {
    const view = buildSearchPerformanceView([
      { date: '2026-09-10', url: '/blog/a', query: 'resume tips', country: null, device: null, clicks: 4, impressions: 100, ctr: 0.04, average_position: 12 },
    ]);
    expect(view.countryAvailable).toBe(false);
    expect(view.deviceAvailable).toBe(false);
    expect(view.topQueriesAvailable).toBe(true);
  });

  it('never fabricates a position when impressions are zero', () => {
    const view = buildSearchPerformanceView([
      { date: '2026-09-10', url: null, query: null, country: null, device: null, clicks: 0, impressions: 0, ctr: 0, average_position: 0 },
    ]);
    expect(view.totals.ctr).toBe('0%');
    expect(view.totals.averagePosition).toBe('Unavailable');
    expect(view.topQueries).toEqual([]);
  });
});

describe('A11.3 trend chart geometry', () => {
  it('maps daily points to bars scaled against the max, with a minimum visible bar', () => {
    const bars = trendChartPoints(
      [
        { date: '2026-09-10', clicks: 0, impressions: 100 },
        { date: '2026-09-11', clicks: 1, impressions: 200 },
        { date: '2026-09-12', clicks: 10, impressions: 300 },
      ],
      300,
      100,
      6,
    );
    expect(bars).toHaveLength(3);
    expect(bars[2].impressionsHeight).toBe(100);
    expect(bars[0].impressionsHeight).toBe(33);
    expect(bars[1].clicksHeight).toBe(1); // nonzero clicks but below rounding threshold: still visible
    expect(bars[0].clicksHeight).toBe(0); // zero clicks: no bar
    expect(bars.every((b) => b.x >= 0 && b.barWidth >= 2)).toBe(true);
  });

  it('handles empty input', () => {
    expect(trendChartPoints([], 300, 100, 6)).toEqual([]);
  });
});

describe('A11.4 conversion panel view', () => {
  it('counts real first-party signup events and distinct users', () => {
    const events: SeoConversionEventRow[] = [
      { event_name: 'signup_created_from_article', user_id: 'u1', article_slug: 'a', tool_id: null, created_at: '2026-09-20T10:00:00Z' },
      { event_name: 'signup_created_from_article', user_id: 'u2', article_slug: 'b', tool_id: null, created_at: '2026-09-21T10:00:00Z' },
      { event_name: 'signup_created_from_tool', user_id: 'u1', article_slug: null, tool_id: 'ats', created_at: '2026-09-19T10:00:00Z' },
      { event_name: 'article_tool_click', user_id: null, article_slug: 'a', tool_id: 'ats', created_at: '2026-09-18T10:00:00Z' },
    ];
    const view = buildConversionPanelView(events);
    expect(view.completedRegistrations).toEqual({ available: true, fromArticles: 2, fromTools: 1, total: 3, distinctUsers: 2 });
    expect(view.eventCounts[0]).toEqual({ event: 'signup_created_from_article', count: 2, lastAt: '2026-09-21' });
    expect(view.eventCounts).toHaveLength(3);
  });

  it('reports sessions, starts and rate as honestly unavailable with reasons, never placeholders', () => {
    const view = buildConversionPanelView([]);
    expect(view.organicSessions.available).toBe(false);
    expect(view.organicSessions.reason).toContain('no analytics property');
    expect(view.organicSessions.reason).toContain('never used as a substitute');
    expect(view.signupStarts.available).toBe(false);
    expect(view.signupStarts.reason).toContain('no signup-start event');
    expect(view.organicToSignupRate.available).toBe(false);
    expect(view.organicToSignupRate.reason).toContain('organic sessions');
    expect(view.completedRegistrations.total).toBe(0);
    expect(view.eventCounts).toEqual([]);
    expect(view.analyticsPropertyConnected).toBe(false);
    expect(view.sourceLabel).toContain('first-party');
    expect(view.sourceLabel).toContain('separate from Google Search Console');
  });
});

describe('A11.2 content inventory view', () => {
  it('joins articles with URL audits and maps every spec column honestly', () => {
    const articles: SeoArticleRow[] = [
      {
        title: 'How to Write a Resume',
        slug: 'how-to-write-a-resume',
        url: 'https://jobiest.com/blog/how-to-write-a-resume',
        target_keyword: 'how to write a resume',
        status: 'PUBLISHED',
        published_at: '2026-09-15T08:00:00Z',
        internal_links: ['/blog/a', '/free-resume-summary-generator', '/pricing'],
        quality_report: { gate: 'PASSED' },
        indexing_status: 'DISCOVERABLE_VIA_SITEMAP',
      },
      {
        title: 'Draft article',
        slug: 'draft',
        url: 'https://jobiest.com/blog/draft',
        target_keyword: null,
        status: 'DRAFT',
        published_at: null,
        internal_links: null,
        quality_report: null,
        indexing_status: null,
      },
    ];
    const audits: SeoUrlAuditRow[] = [
      { url: 'https://jobiest.com/blog/how-to-write-a-resume', indexing_state: 'INDEXED_CONFIRMED_BY_GOOGLE', sitemap_included: true, status: 'OK' },
      { url: 'https://jobiest.com/other', indexing_state: null, sitemap_included: false, status: 'OK' },
    ];
    const rows = buildContentInventoryView(articles, audits);
    expect(rows[0]).toEqual({
      title: 'How to Write a Resume',
      url: 'https://jobiest.com/blog/how-to-write-a-resume',
      primaryKeyword: 'how to write a resume',
      status: 'PUBLISHED',
      publicationDate: '2026-09-15',
      gscIndexingStatus: 'INDEXED_CONFIRMED_BY_GOOGLE',
      internalLinksCount: 3,
      seoAuditStatus: 'PASSED',
    });
    expect(rows[1]).toEqual({
      title: 'Draft article',
      url: 'https://jobiest.com/blog/draft',
      primaryKeyword: 'Unknown',
      status: 'DRAFT',
      publicationDate: 'Unknown',
      gscIndexingStatus: 'Not inspected yet',
      internalLinksCount: null,
      seoAuditStatus: 'Not run',
    });
  });
});
