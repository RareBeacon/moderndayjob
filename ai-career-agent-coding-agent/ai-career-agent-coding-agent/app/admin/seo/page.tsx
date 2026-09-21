import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminForbidden, AdminShell } from '@/components/site/AdminShell';
import { getSeoConversionEvents, getSeoContentInventory, getSeoDashboardData, getSeoKeywordResearch, getSeoSearchPerformance } from '@/lib/seo/service';
import { keywordRowView, summarizeKeywordResearch } from '@/lib/seo/keyword-view';
import { buildContentInventoryView, buildConversionPanelView, buildSearchPerformanceView, trendChartPoints, type DailyMetricPoint, type SeoUrlAuditRow } from '@/lib/seo/performance-view';
import { googleOAuthConfigured } from '@/lib/seo/google';
import { SeoControls } from './SeoControls';

export const dynamic = 'force-dynamic';

function pct(n: unknown) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0%';
  return `${(v * 100).toFixed(1)}%`;
}

/** Server-rendered trend chart: impressions (navy) and clicks (yellow) per day, pure SVG. */
function TrendChart({ daily }: { daily: DailyMetricPoint[] }) {
  const W = 720;
  const H = 150;
  const bars = trendChartPoints(daily, W, H, 6);
  if (!bars.length) return null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="seo-trend" role="img" aria-label="Google Search Console clicks and impressions per day">
        <line x1="0" y1={H} x2={W} y2={H} stroke="#e2e6ed" strokeWidth="1" />
        {bars.map((b) => (
          <g key={b.date}>
            <rect x={b.x} y={H - b.impressionsHeight} width={b.barWidth} height={b.impressionsHeight} fill="#111c35" opacity="0.22" />
            <rect x={b.x} y={H - b.clicksHeight} width={b.barWidth} height={b.clicksHeight} fill="#f8d64d" />
          </g>
        ))}
        <text x="0" y={H + 16} fontSize="10" fill="#616d81">{daily[0]?.date}</text>
        <text x={W} y={H + 16} fontSize="10" fill="#616d81" textAnchor="end">{daily[daily.length - 1]?.date}</text>
      </svg>
      <p className="seo-trend-legend"><span className="swatch impressions" /> Impressions <span className="swatch clicks" /> Clicks</p>
    </div>
  );
}

export default async function SeoMissionControlPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/seo');
  const { data: admin } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!admin) return <AdminForbidden />;

  const data = await getSeoDashboardData();
  const project = data.project;
  const keywordResearch = await getSeoKeywordResearch(project?.id ?? null);
  const keywordViews = keywordResearch.keywords.map(keywordRowView);
  const keywordSummary = summarizeKeywordResearch(keywordViews);
  const performance = await getSeoSearchPerformance(project?.id ?? null);
  const performanceView = buildSearchPerformanceView(performance.metrics);
  const conversions = await getSeoConversionEvents(project?.id ?? null);
  const conversionView = buildConversionPanelView(conversions.events);
  const inventory = await getSeoContentInventory(project?.id ?? null);
  const inventoryView = buildContentInventoryView(inventory.articles, data.urlAudits as unknown as SeoUrlAuditRow[]);
  const connected = Boolean(project?.google_oauth_ciphertext && project.search_console_property);
  const totals = data.metrics.reduce<{ clicks: number; impressions: number; positionTotal: number; rows: number }>((acc, row) => {
    acc.clicks += Number(row.clicks ?? 0);
    acc.impressions += Number(row.impressions ?? 0);
    acc.positionTotal += Number(row.average_position ?? 0);
    acc.rows += 1;
    return acc;
  }, { clicks: 0, impressions: 0, positionTotal: 0, rows: 0 });
  const avgCtr = totals.impressions ? totals.clicks / totals.impressions : 0;
  const avgPos = totals.rows ? totals.positionTotal / totals.rows : 0;
  const urlTotals = data.urlAudits.reduce<{ total: number; indexed: number; notIndexed: number; pending: number; errors: number; sitemap: number }>((acc, row) => {
    acc.total += 1;
    const state = String(row.indexing_state ?? '');
    if (state === 'INDEXED_CONFIRMED_BY_GOOGLE') acc.indexed += 1;
    else if (/not indexed|not on google|excluded|fail/i.test(state)) acc.notIndexed += 1;
    else acc.pending += 1;
    if (String(row.status ?? '') === 'ERROR' || Number(row.http_status ?? 200) >= 400) acc.errors += 1;
    if (row.sitemap_included) acc.sitemap += 1;
    return acc;
  }, { total: 0, indexed: 0, notIndexed: 0, pending: 0, errors: 0, sitemap: 0 });

  return (
    <AdminShell active="seo">
      <h1 className="ad-h1">SEO Mission Control</h1>
      <p className="ad-lede">
        Autonomous SEO foundation for Jobiest: Google Search Console connection, sitemap discovery,
        keyword roadmap, content inventory, indexing inspection, and agent audit logs. Metrics are shown only when imported from a real source.
      </p>

      {!data.tablesReady && (
        <div className="seo-alert danger">
          <strong>SEO database migration required.</strong>
          <p>{data.error} Apply SEO migrations 014, 019, 020 and 021, then reload this page.</p>
        </div>
      )}

      {data.tablesReady && project && (
        <>
          <section className="seo-grid-stats">
            <div className="seo-stat"><span>Status</span><strong>{project.status}</strong></div>
            <div className="seo-stat"><span>Mode</span><strong>{project.mode}</strong></div>
            <div className="seo-stat"><span>Agent</span><strong>{project.paused ? 'Paused' : 'Running'}</strong></div>
            <div className="seo-stat"><span>Google</span><strong>{connected ? 'Connected' : 'Not connected'}</strong></div>
            <div className="seo-stat"><span>Public SEO pages</span><strong>{urlTotals.total || 'Pending'}</strong></div>
            <div className="seo-stat"><span>Indexed by Google</span><strong>{urlTotals.indexed}</strong></div>
            <div className="seo-stat"><span>Not indexed</span><strong>{urlTotals.notIndexed}</strong></div>
            <div className="seo-stat"><span>Waiting</span><strong>{urlTotals.pending}</strong></div>
            <div className="seo-stat"><span>URL errors</span><strong>{urlTotals.errors}</strong></div>
            <div className="seo-stat"><span>In sitemap</span><strong>{urlTotals.sitemap || 'Pending'}</strong></div>
            <div className="seo-stat"><span>Last sync</span><strong>{project.last_sync_at ? project.last_sync_at.slice(0, 10) : 'Unavailable'}</strong></div>
            <div className="seo-stat"><span>Clicks</span><strong>{totals.clicks}</strong></div>
            <div className="seo-stat"><span>Impressions</span><strong>{totals.impressions}</strong></div>
            <div className="seo-stat"><span>CTR</span><strong>{pct(avgCtr)}</strong></div>
            <div className="seo-stat"><span>Avg position</span><strong>{avgPos ? avgPos.toFixed(1) : 'Unavailable'}</strong></div>
          </section>

          <section className="seo-panel">
            <h2>First-time setup wizard</h2>
            <ol className="seo-steps">
              <li className={googleOAuthConfigured() ? 'ok' : 'warn'}>Configure Google OAuth env vars: {googleOAuthConfigured() ? 'ready' : 'missing'}</li>
              <li className={project.google_oauth_ciphertext ? 'ok' : 'warn'}>Connect Google account: {project.google_oauth_ciphertext ? 'connected' : 'pending'}</li>
              <li className={project.search_console_property ? 'ok' : 'warn'}>Select Search Console property: {project.search_console_property ?? 'pending'}</li>
              <li className="ok">Detect sitemap: {project.sitemap_url}</li>
              <li className={project.last_audit_at ? 'ok' : 'warn'}>Initial SEO audit: {project.last_audit_at ? project.last_audit_at.slice(0, 10) : 'pending'}</li>
              <li className={project.mode === 'AUTONOMOUS' && !project.paused ? 'ok' : 'warn'}>Enable autonomous loop: {project.paused ? 'paused' : project.mode}</li>
            </ol>
            <div className="seo-button-row">
              <a className="btn" href="/api/admin/seo/oauth/start">Connect Google Search Console</a>
              <a className="btn secondary" href="/api/admin/seo/sites">List GSC properties</a>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Google Indexing API is not used for normal blog posts. Articles are published, added to sitemap/internal links, optionally inspected through URL Inspection API, and monitored. The agent never claims a URL is indexed just because discovery was recorded.
            </p>
          </section>

          <SeoControls paused={project.paused} connected={connected} />

          <section className="seo-panel">
            <h2>Content management (A11.2)</h2>
            {inventory.ready ? (
              <>
                <table className="ad-table"><thead><tr><th>Article title</th><th>URL</th><th>Primary keyword</th><th>Status</th><th>Published</th><th>GSC indexing status</th><th>Internal links</th><th>SEO audit</th></tr></thead><tbody>
                  {inventoryView.length === 0 && <tr><td colSpan={8} className="ad-empty">No SEO articles synced yet. Use "Publish Strategic Content".</td></tr>}
                  {inventoryView.map((row) => (
                    <tr key={row.url || row.title}>
                      <td>{row.title}</td>
                      <td className="ad-mono">{row.url ? <a href={row.url} target="_blank" rel="noreferrer">{row.url.replace('https://jobiest.com', '')}</a> : '-'}</td>
                      <td>{row.primaryKeyword}</td>
                      <td><span className="ad-chip">{row.status}</span></td>
                      <td className="ad-mono">{row.publicationDate}</td>
                      <td>{row.gscIndexingStatus}</td>
                      <td className="ad-mono">{row.internalLinksCount ?? 'Unknown'}</td>
                      <td>{row.seoAuditStatus}</td>
                    </tr>
                  ))}
                </tbody></table>
                <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Source: synced CMS rows (seo_articles) joined with URL audit results. GSC indexing status comes from URL Inspection records; "DISCOVERABLE_VIA_SITEMAP" means submitted for discovery, not confirmed indexing.</p>
              </>
            ) : (
              <p className="ad-empty">Content data not available: {inventory.error}</p>
            )}
          </section>

          <section className="seo-panel">
            <h2>Search performance (A11.3, Google Search Console only)</h2>
            {performance.ready ? (
              performanceView.available ? (
                <>
                  <div className="seo-grid-stats">
                    <div className="seo-stat"><span>Impressions</span><strong>{performanceView.totals.impressions}</strong></div>
                    <div className="seo-stat"><span>Clicks</span><strong>{performanceView.totals.clicks}</strong></div>
                    <div className="seo-stat"><span>CTR</span><strong>{performanceView.totals.ctr}</strong></div>
                    <div className="seo-stat"><span>Avg position</span><strong>{performanceView.totals.averagePosition}</strong></div>
                    <div className="seo-stat"><span>Window</span><strong>{performanceView.dateRange?.from} to {performanceView.dateRange?.to}</strong></div>
                  </div>
                  <div className="seo-panel-sub">
                    <h3>Impressions and clicks trend</h3>
                    <TrendChart daily={performanceView.daily} />
                  </div>
                  <div className="seo-two-col">
                    <div>
                      <h3>Top queries</h3>
                      {performanceView.topQueriesAvailable ? (
                        <table className="ad-table"><thead><tr><th>Query</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Position</th></tr></thead><tbody>
                          {performanceView.topQueries.map((q) => <tr key={q.query}><td>{q.query}</td><td className="ad-mono">{q.impressions}</td><td className="ad-mono">{q.clicks}</td><td className="ad-mono">{q.ctr}</td><td className="ad-mono">{q.averagePosition}</td></tr>)}
                        </tbody></table>
                      ) : (
                        <p className="ad-empty">Data not available: no query-dimension rows imported yet.</p>
                      )}
                    </div>
                    <div>
                      <h3>Country breakdown</h3>
                      {performanceView.countryAvailable ? (
                        <table className="ad-table"><thead><tr><th>Country</th><th>Impressions</th><th>Clicks</th><th>Share</th></tr></thead><tbody>
                          {performanceView.country.map((c) => <tr key={c.label}><td className="ad-mono">{c.label}</td><td className="ad-mono">{c.impressions}</td><td className="ad-mono">{c.clicks}</td><td className="ad-mono">{c.share}</td></tr>)}
                        </tbody></table>
                      ) : (
                        <p className="ad-empty">Data not available: country dimension rows are imported by the extended GSC import; run "Import GSC Metrics" to populate them.</p>
                      )}
                      <h3 style={{ marginTop: 18 }}>Device breakdown</h3>
                      {performanceView.deviceAvailable ? (
                        <table className="ad-table"><thead><tr><th>Device</th><th>Impressions</th><th>Clicks</th><th>Share</th></tr></thead><tbody>
                          {performanceView.device.map((d) => <tr key={d.label}><td className="ad-mono">{d.label}</td><td className="ad-mono">{d.impressions}</td><td className="ad-mono">{d.clicks}</td><td className="ad-mono">{d.share}</td></tr>)}
                        </tbody></table>
                      ) : (
                        <p className="ad-empty">Data not available: device dimension rows are imported by the extended GSC import; run "Import GSC Metrics" to populate them.</p>
                      )}
                    </div>
                  </div>
                  <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>{performanceView.sourceLabel}. Average position is impression-weighted.</p>
                </>
              ) : (
                <p className="ad-empty">{performanceView.unavailableReason}</p>
              )
            ) : (
              <p className="ad-empty">Search data not available: {performance.error}</p>
            )}
          </section>

          <section className="seo-two-col">
            <div className="seo-panel">
              <h2>Conversion (A11.4, first-party events)</h2>
              {conversions.ready ? (
                <>
                  <div className="seo-grid-stats">
                    <div className="seo-stat"><span>Organic sessions</span><strong>Data not available</strong></div>
                    <div className="seo-stat"><span>Signup starts from organic</span><strong>Data not available</strong></div>
                    <div className="seo-stat"><span>Registrations from organic</span><strong>{conversionView.completedRegistrations.total}</strong></div>
                    <div className="seo-stat"><span>Organic-to-signup rate</span><strong>Data not available</strong></div>
                  </div>
                  <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                    {conversionView.organicSessions.reason}
                  </p>
                  <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    Registrations from organic content: {conversionView.completedRegistrations.fromArticles} from articles, {conversionView.completedRegistrations.fromTools} from free tools ({conversionView.completedRegistrations.distinctUsers} distinct users). Source: {conversionView.sourceLabel}
                  </p>
                  <table className="ad-table" style={{ marginTop: 10 }}><thead><tr><th>Event</th><th>Count</th><th>Last seen</th></tr></thead><tbody>
                    {conversionView.eventCounts.length === 0 && <tr><td colSpan={3} className="ad-empty">No first-party conversion events recorded yet.</td></tr>}
                    {conversionView.eventCounts.map((e) => <tr key={e.event}><td className="ad-mono">{e.event}</td><td className="ad-mono">{e.count}</td><td className="ad-mono">{e.lastAt || '-'}</td></tr>)}
                  </tbody></table>
                </>
              ) : (
                <p className="ad-empty">Conversion data not available: {conversions.error}</p>
              )}
            </div>
            <div className="seo-panel">
              <h2>Keyword research summary</h2>
              {keywordResearch.ready ? (
                <>
                  <div className="seo-grid-stats">
                    <div className="seo-stat"><span>Total keywords</span><strong>{keywordSummary.total}</strong></div>
                    <div className="seo-stat"><span>Observed</span><strong>{keywordSummary.byConfidence.Observed ?? 0}</strong></div>
                    <div className="seo-stat"><span>Qualitative</span><strong>{keywordSummary.byConfidence.Qualitative ?? 0}</strong></div>
                    <div className="seo-stat"><span>Hypothesis</span><strong>{keywordSummary.byConfidence.Hypothesis ?? 0}</strong></div>
                    <div className="seo-stat"><span>To create</span><strong>{keywordSummary.byOpportunity.Create ?? 0}</strong></div>
                    <div className="seo-stat"><span>To update</span><strong>{keywordSummary.byOpportunity.Update ?? 0}</strong></div>
                  </div>
                  <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                    Sources: Google autocomplete and SERP observation across NG, GB, US, CA.
                    {!keywordResearch.perMarketSchema
                      ? ' Migration 028 pending: once applied, each market gets its own row plus structured volume, difficulty and confidence fields.'
                      : ' Per-market rows active (migration 028 applied).'}
                    {' '}Volume and difficulty show Unknown because no keyword volume source is accessible; see docs/KEYWORD_RESEARCH.md.
                  </p>
                </>
              ) : (
                <p className="ad-empty">Keyword data not available: {keywordResearch.error}</p>
              )}
            </div>
          </section>

          <section className="seo-panel">
            <h2>Keyword research database</h2>
            {keywordResearch.ready && keywordViews.length > 0 ? (
              <>
                <table className="ad-table"><thead><tr><th>Keyword</th><th>Intent</th><th>Country</th><th>Volume</th><th>Difficulty</th><th>Confidence</th><th>Research date</th><th>Opportunity</th></tr></thead><tbody>
                  {keywordViews.slice(0, 120).map((k) => (
                    <tr key={`${k.keyword}|${k.country}`}>
                      <td>{k.keyword}</td>
                      <td><span className="ad-chip">{k.intent}</span></td>
                      <td className="ad-mono">{k.country || 'Unknown'}</td>
                      <td className="ad-mono">{k.volume}</td>
                      <td className="ad-mono">{k.difficulty}</td>
                      <td>{k.confidence}</td>
                      <td className="ad-mono">{k.researchDate || 'Unknown'}</td>
                      <td>{k.opportunity}</td>
                    </tr>
                  ))}
                </tbody></table>
                {keywordResearch.total > 120 && <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Showing 120 of {keywordResearch.total} researched keywords.</p>}
              </>
            ) : (
              <p className="ad-empty">{keywordResearch.ready ? 'No keyword research rows yet.' : `Keyword data not available: ${keywordResearch.error}`}</p>
            )}
          </section>

          <section className="seo-panel">
            <h2>Public URL audit</h2>
            <table className="ad-table"><thead><tr><th>URL</th><th>Status</th><th>HTTP</th><th>Sitemap</th><th>Google state</th><th>Errors</th></tr></thead><tbody>
              {data.urlAudits.length === 0 && <tr><td colSpan={6} className="ad-empty">Run Audit Public URLs to build the definitive indexable URL list.</td></tr>}
              {data.urlAudits.slice(0, 40).map((x) => <tr key={String(x.id)}><td className="ad-mono">{String(x.url ?? '-')}</td><td><span className="ad-chip">{String(x.status ?? '-')}</span></td><td>{String(x.http_status ?? '-')}</td><td>{x.sitemap_included ? 'Yes' : 'No'}</td><td>{String(x.indexing_state ?? '-')}</td><td>{Array.isArray(x.errors) ? x.errors.join(', ') : '-'}</td></tr>)}
            </tbody></table>
          </section>

          <section className="seo-two-col">
            <div className="seo-panel">
              <h2>Indexing and discovery</h2>
              <table className="ad-table"><thead><tr><th>URL</th><th>Mechanism</th><th>Status</th></tr></thead><tbody>
                {data.indexing.length === 0 && <tr><td colSpan={3} className="ad-empty">No discovery or inspection records yet.</td></tr>}
                {data.indexing.map((x) => <tr key={String(x.id)}><td className="ad-mono">{String(x.url ?? '-')}</td><td>{String(x.mechanism ?? '-')}</td><td>{String(x.status ?? '-')}</td></tr>)}
              </tbody></table>
            </div>
            <div className="seo-panel">
              <h2>Agent activity</h2>
              <div className="seo-activity">
                {data.logs.length === 0 && <p className="muted">No SEO agent activity yet.</p>}
                {data.logs.map((log) => <p key={String(log.id)}><span>{String(log.created_at ?? '').slice(11, 16)}</span> {String(log.action ?? '-')} {log.target_url ? <em>{String(log.target_url)}</em> : null}</p>)}
              </div>
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}
