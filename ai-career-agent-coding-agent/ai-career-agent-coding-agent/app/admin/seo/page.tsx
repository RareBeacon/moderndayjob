import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminForbidden, AdminShell } from '@/components/site/AdminShell';
import { getSeoDashboardData } from '@/lib/seo/service';
import { googleOAuthConfigured } from '@/lib/seo/google';
import { SeoControls } from './SeoControls';

export const dynamic = 'force-dynamic';

function pct(n: unknown) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0%';
  return `${(v * 100).toFixed(1)}%`;
}

export default async function SeoMissionControlPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/seo');
  const { data: admin } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!admin) return <AdminForbidden />;

  const data = await getSeoDashboardData();
  const project = data.project;
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

          <section className="seo-two-col">
            <div className="seo-panel">
              <h2>Content</h2>
              <table className="ad-table"><thead><tr><th>Title</th><th>Status</th><th>Keyword</th><th>Indexing</th></tr></thead><tbody>
                {data.articles.length === 0 && <tr><td colSpan={4} className="ad-empty">No SEO articles synced yet.</td></tr>}
                {data.articles.map((a) => <tr key={String(a.id)}><td>{String(a.title ?? '-')}</td><td><span className="ad-chip">{String(a.status ?? '-')}</span></td><td>{String(a.target_keyword ?? '-')}</td><td>{String(a.indexing_status ?? '-')}</td></tr>)}
              </tbody></table>
            </div>
            <div className="seo-panel">
              <h2>Keywords</h2>
              <table className="ad-table"><thead><tr><th>Keyword</th><th>Intent</th><th>Score</th><th>Metrics</th></tr></thead><tbody>
                {data.keywords.length === 0 && <tr><td colSpan={4} className="ad-empty">No keyword roadmap yet.</td></tr>}
                {data.keywords.map((k) => <tr key={String(k.id)}><td>{String(k.keyword ?? '-')}</td><td>{String(k.intent ?? '-')}</td><td className="ad-mono">{String(k.opportunity_score ?? 'unavailable')}</td><td>{String(k.metric_source ?? 'unavailable')}</td></tr>)}
              </tbody></table>
            </div>
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
