import { requireUserOrRedirect } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import { getAdminRadarDashboardData } from '@/lib/radar/sync/persistence';
import {
  AdminRadarCandidateDecisionButtons,
  AdminRadarSweepAndExclusionClient,
} from './AdminRadarActionsClient';

export const dynamic = 'force-dynamic';

export default async function AdminRadarPage() {
  const user = await requireUserOrRedirect('/admin/radar');
  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const data = await getAdminRadarDashboardData().catch(() => null);
  const migrationPending = !data || data.migrationPending;
  const summary = data?.summary;

  return (
    <AdminShell active="radar">
      <h1 className="ad-h1">Global Opportunity Radar &amp; Employment Intelligence</h1>
      <p className="ad-lede">
        Monitor First-Mover direct employer discoveries, enforce source compliance and takedowns, and review newly
        detected hiring infrastructure before promotion.
      </p>

      {migrationPending && (
        <div
          style={{
            padding: '14px 16px',
            border: '1px solid var(--line)',
            borderRadius: 8,
            marginBottom: 22,
          }}
        >
          <strong>Database activation pending:</strong> Run{' '}
          <code>supabase/release-bundles/053_to_056_radar_phase1_to_3.sql</code> in the Supabase SQL Editor to activate
          the Radar tables, RLS locks, and First-Party Employer sync triggers.
        </div>
      )}

      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>Active Verified Jobs</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.total_active_jobs}</div>
          </div>
          <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>First-Mover &amp; Exclusive</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {summary.first_party_exclusive_count + summary.first_mover_exclusive_count + summary.early_direct_count}
            </div>
          </div>
          <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>Avg Lead Time vs Feeds</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {summary.avg_lead_time_hours != null ? `${summary.avg_lead_time_hours}h` : 'N/A'}
            </div>
          </div>
          <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>Verified Employers</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.verified_employers_count}</div>
          </div>
          <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>Scams Quarantined</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.scams_rejected_count}</div>
          </div>
          <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>Inspected External Forms</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.inspected_forms_count}</div>
          </div>
          <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>Assisted Prep Packs</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.assisted_preparations_count}</div>
          </div>
          <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>Alert Subscribers</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.active_alert_subscribers_count}</div>
          </div>
        </div>
      )}

      <AdminRadarSweepAndExclusionClient disabled={migrationPending} />

      <h2 style={{ fontSize: 19, marginBottom: 10 }}>Queued Hiring Infrastructure Candidates</h2>
      <div className="ad-scroll" style={{ marginBottom: 28 }}>
        <table className="ad-table">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Provider &amp; Token</th>
              <th>Host</th>
              <th>Discovered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.pendingCandidates ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="ad-empty">No queued source candidates awaiting review.</td>
              </tr>
            )}
            {(data?.pendingCandidates ?? []).map((c) => {
              const id = String(c.id ?? '');
              return (
                <tr key={id}>
                  <td><span className="ad-chip">{String(c.discovery_channel ?? '')}</span></td>
                  <td className="ad-mono">
                    {String(c.detected_provider ?? 'unknown')}:{String(c.detected_board_token ?? '-')}
                  </td>
                  <td className="ad-mono">{String(c.normalized_host ?? '')}</td>
                  <td className="ad-mono">{String(c.first_seen_at ?? '').slice(0, 10)}</td>
                  <td>
                    <AdminRadarCandidateDecisionButtons candidateId={id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 19, margin: '28px 0 10px' }}>
        Verified Direct Employers Universe ({data?.verifiedEmployers?.length ?? 0} Active)
      </h2>
      <p className="ad-lede" style={{ marginBottom: 14 }}>
        Direct first-party hiring organizations indexed across blockchain intelligence, security, compliance, and enterprise infrastructure.
      </p>
      <div className="ad-scroll" style={{ marginBottom: 28, maxHeight: 420, overflowY: 'auto' }}>
        <table className="ad-table">
          <thead>
            <tr>
              <th>Employer</th>
              <th>Domain</th>
              <th>Industry</th>
              <th>Region</th>
              <th>Legitimacy</th>
              <th>Primary ATS Adapter</th>
            </tr>
          </thead>
          <tbody>
            {(data?.verifiedEmployers ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="ad-empty">No verified employers indexed yet.</td>
              </tr>
            )}
            {(data?.verifiedEmployers ?? []).map((emp) => {
              const infra = emp.hiring_infrastructure as Record<string, unknown> | null;
              const primaryAdapter = String(infra?.primaryAtsAdapter ?? infra?.ats_adapter ?? 'ATS Direct');
              return (
                <tr key={String(emp.id)}>
                  <td>
                    <strong>{String(emp.canonical_name ?? '')}</strong>
                  </td>
                  <td className="ad-mono">
                    <a
                      href={String(emp.careers_url || emp.website_url || `https://${emp.primary_domain}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-link"
                    >
                      {String(emp.primary_domain ?? '')}
                    </a>
                  </td>
                  <td style={{ fontSize: 12 }}>{String(emp.industry ?? 'Blockchain Intelligence')}</td>
                  <td><span className="ad-chip">{String(emp.region ?? emp.country_code ?? 'GLOBAL')}</span></td>
                  <td>
                    <span className="ad-chip ok">
                      {String(emp.employer_legitimacy_score ?? 95)}/100
                    </span>
                  </td>
                  <td>
                    <span className="ad-chip">{primaryAdapter}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 19, marginBottom: 10 }}>Recent Crawl Runs</h2>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Source</th>
              <th>Outcome</th>
              <th>HTTP</th>
              <th>Seen / Created</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recentRuns ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="ad-empty">No Radar crawl runs recorded yet.</td>
              </tr>
            )}
            {(data?.recentRuns ?? []).map((r) => (
              <tr key={String(r.id ?? '')}>
                <td className="ad-mono">{String(r.started_at ?? '').slice(0, 19).replace('T', ' ')}</td>
                <td className="ad-mono">{String(r.source_id ?? '')}</td>
                <td>
                  <span className={`ad-chip ${String(r.outcome).startsWith('OK') ? 'ok' : ''}`}>
                    {String(r.outcome ?? '')}
                  </span>
                </td>
                <td className="ad-mono">{String(r.http_status ?? '-')}</td>
                <td className="ad-mono">
                  {String(r.items_seen ?? 0)} / {String(r.items_created ?? 0)}
                </td>
                <td className="ad-mono">{String(r.duration_ms ?? 0)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
