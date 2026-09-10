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
          <p>{data.error} Apply `supabase/migrations/014_seo_agent.sql`, then reload this page.</p>
        </div>
      )}

      {data.tablesReady && project && (
        <>
          <section className="seo-grid-stats">
            <div className="seo-stat"><span>Status</span><strong>{project.status}</strong></div>
            <div className="seo-stat"><span>Mode</span><strong>{project.mode}</strong></div>
            <div className="seo-stat"><span>Agent</span><strong>{project.paused ? 'Paused' : 'Running'}</strong></div>
            <div className="seo-stat"><span>Google</span><strong>{connected ? 'Connected' : 'Not connected'}</strong></div>
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
