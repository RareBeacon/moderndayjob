import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import RevealEmail from './RevealEmail';
import ChangePlan from './ChangePlan';

export const dynamic = 'force-dynamic';

/**
 * Admin • user detail (B-063): one-page investigation without a database
 * console. Everything except the email renders directly; the email requires
 * the password-reauth reveal flow (RevealEmail) and is audit-logged
 * fail-closed server-side.
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/users');
  const { id } = await params;

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const [profile, subscription, lifetime, usage, apps, audit, security, history, scheduled] = await Promise.all([
    supabaseAdmin.from('profiles').select('user_id,email,full_name,account_status,created_at').eq('user_id', id).maybeSingle(),
    // Migration 043 columns (source/granted_by/current_period_end) with a
    // graceful fallback while it is pending: the panel then shows the basics.
    supabaseAdmin
      .from('subscriptions')
      .select('plan,status,source,grant_reason,current_period_start,current_period_end,granted_by')
      .eq('user_id', id)
      .maybeSingle()
      .then((r) =>
        r.error && /source|granted_by|current_period_end|column/i.test(String(r.error.message ?? ''))
          ? supabaseAdmin.from('subscriptions').select('plan,status').eq('user_id', id).maybeSingle()
          : r,
      ),
    supabaseAdmin.from('usage_lifetime').select('docs_used,tools_used').eq('user_id', id).maybeSingle(),
    supabaseAdmin.from('ai_usage').select('created_at,feature,provider,status,latency_ms').eq('user_id', id).order('created_at', { ascending: false }).limit(15),
    supabaseAdmin.from('applications').select('id,status,created_at,jobs(company,title)').eq('user_id', id).order('created_at', { ascending: false }).limit(8),
    supabaseAdmin.from('audit_logs').select('action,resource,outcome,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(15),
    supabaseAdmin.from('security_events').select('event_type,severity,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(8),
    supabaseAdmin
      .from('subscription_history')
      .select('old_plan,new_plan,old_status,new_status,source,reason,period_start,period_end,created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => (r.error ? { data: [], error: r.error } : r)),
    supabaseAdmin
      .from('scheduled_plan_changes')
      .select('plan,duration_days,activate_at,status')
      .eq('user_id', id)
      .eq('status', 'SCHEDULED')
      .maybeSingle()
      .then((r) => (r.error ? { data: null, error: r.error } : r)),
  ]);

  if (!profile.data) {
    return (
      <AdminShell active="users">
        <h1 className="ad-h1">User not found</h1>
        <p className="ad-lede">No profile row for this id.</p>
      </AdminShell>
    );
  }

  const emailDomain = String(profile.data.email ?? '').split('@')[1] ?? '-';

  return (
    <AdminShell active="users">
      <p><Link className="inline-link" href="/admin/users">← All users</Link></p>
      <h1 className="ad-h1">{profile.data.full_name ?? 'User'}</h1>
      <p className="ad-lede">
        Joined {String(profile.data.created_at ?? '').slice(0, 10)} · plan{' '}
        <span className="ad-chip">{(subscription.data as { plan?: string } | null)?.plan ?? 'FREE'}</span> · status{' '}
        <span className="ad-chip">{profile.data.account_status ?? 'unknown'}</span> · domain{' '}
        <span className="ad-mono">{emailDomain}</span>
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Subscription</h2>
      {(() => {
        const sub = (subscription.data ?? null) as {
          plan?: string; status?: string; source?: string; grant_reason?: string | null;
          current_period_end?: string | null; current_period_start?: string | null;
        } | null;
        const subPlan = sub?.plan ?? 'FREE';
        const subStatus = sub?.status ?? 'none';
        const expiresAt = sub?.current_period_end ?? null;
        const daysLeft = expiresAt ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000) : null;
        const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
        const statusTone = subStatus.startsWith('ACTIVE') && (daysLeft === null || daysLeft > 0)
          ? 'ok'
          : expiringSoon && daysLeft !== null && daysLeft >= 0
            ? 'soon'
            : subStatus === 'SCHEDULED'
              ? 'soon'
              : 'expired';
        const pending = (scheduled.data ?? null) as { plan?: string; duration_days?: number; activate_at?: string } | null;
        const historyRows = ((history.data ?? []) as Array<{
          old_plan?: string | null; new_plan?: string; old_status?: string | null; new_status?: string;
          source?: string; reason?: string | null; period_start?: string | null; period_end?: string | null; created_at?: string;
        }>) ?? [];
        return (
          <>
            <p style={{ margin: '6px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="ad-chip">Plan: {subPlan}</span>
              <span className="ad-chip">Status: {subStatus}</span>
              {sub?.source && <span className="ad-chip">Source: {sub.source}</span>}
              {expiresAt && <span className="ad-chip">Expires: {String(expiresAt).slice(0, 10)}</span>}
              {daysLeft !== null && <span className="ad-chip">{daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining` : 'expired'}</span>}
              <span className="ad-chip" style={{ outline: statusTone === 'ok' ? '1px solid #2ecc71' : statusTone === 'soon' ? '1px solid #f39c12' : '1px solid #e74c3c' }}>
                {statusTone === 'ok' ? 'ACTIVE' : statusTone === 'soon' ? 'EXPIRING SOON' : 'EXPIRED'}
              </span>
            </p>
            {sub?.grant_reason && <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>Grant reason: {sub.grant_reason}</p>}
            {pending && (
              <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>
                Pending scheduled grant: {pending.plan} for {pending.duration_days} days from {String(pending.activate_at ?? '').slice(0, 10)}
              </p>
            )}
            <div style={{ margin: '10px 0 4px' }}>
              <ChangePlan
                userId={id}
                current={{ plan: subPlan, status: subStatus, current_period_end: expiresAt, scheduled: pending ? { plan: pending.plan ?? '', activate_at: pending.activate_at ?? '' } : null }}
              />
            </div>
            {historyRows.length > 0 ? (
              <div className="ad-scroll" style={{ marginTop: 12 }}>
                <table className="ad-table">
                  <thead><tr><th>When</th><th>Change</th><th>Status</th><th>Source</th><th>Period</th><th>Reason</th></tr></thead>
                  <tbody>
                    {historyRows.map((h, i) => (
                      <tr key={i}>
                        <td className="ad-mono">{String(h.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
                        <td className="ad-mono">{h.old_plan ?? '-'} to {h.new_plan ?? '-'}</td>
                        <td className="ad-mono">{h.old_status ?? '-'} to {h.new_status ?? '-'}</td>
                        <td className="ad-mono">{h.source ?? '-'}</td>
                        <td className="ad-mono">{h.period_start ? String(h.period_start).slice(0, 10) : ''}{h.period_end ? ` → ${String(h.period_end).slice(0, 10)}` : ''}</td>
                        <td>{h.reason ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>No subscription history yet (migration 043 tracks every change from now on).</p>
            )}
          </>
        );
      })()}

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Email (PII)</h2>
      <p style={{ margin: '6px 0' }}>
        <RevealEmail userId={id} />
      </p>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        Revealing re-verifies your password and writes a fail-closed audit row before the email is returned.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Lifetime usage</h2>
      <p className="ad-mono" style={{ margin: '6px 0' }}>
        documents: {(lifetime.data as { docs_used?: number } | null)?.docs_used ?? 0} · tool uses:{' '}
        {(lifetime.data as { tools_used?: number } | null)?.tools_used ?? 0}
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Recent generations</h2>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead><tr><th>When</th><th>Feature</th><th>Provider</th><th>Status</th><th>Latency</th></tr></thead>
          <tbody>
            {((usage.data ?? []) as Array<{ created_at: string; feature: string; provider: string; status: string; latency_ms: number | null }>).length === 0 && (
              <tr><td colSpan={5} className="ad-empty">No generations yet.</td></tr>
            )}
            {((usage.data ?? []) as Array<{ created_at: string; feature: string; provider: string; status: string; latency_ms: number | null }>).map((u, i) => (
              <tr key={i}>
                <td className="ad-mono">{String(u.created_at).slice(0, 16).replace('T', ' ')}</td>
                <td className="ad-mono">{u.feature}</td>
                <td className="ad-mono">{u.provider}</td>
                <td className="ad-mono">{u.status}</td>
                <td className="ad-mono">{u.latency_ms ?? '-'} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Recent applications</h2>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead><tr><th>When</th><th>Job</th><th>Status</th></tr></thead>
          <tbody>
            {((apps.data ?? []) as Array<{ created_at: string; status: string; jobs?: { company?: string; title?: string } | { company?: string; title?: string }[] | null }>).length === 0 && (
              <tr><td colSpan={3} className="ad-empty">No applications.</td></tr>
            )}
            {((apps.data ?? []) as Array<{ created_at: string; status: string; jobs?: { company?: string; title?: string } | { company?: string; title?: string }[] | null }>).map((a, i) => {
              const job = Array.isArray(a.jobs) ? a.jobs[0] : a.jobs;
              return (
                <tr key={i}>
                  <td className="ad-mono">{String(a.created_at).slice(0, 10)}</td>
                  <td>{job?.company ?? '-'} · {job?.title ?? '-'}</td>
                  <td className="ad-mono">{a.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Recent audit events</h2>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead><tr><th>When</th><th>Action</th><th>Resource</th><th>Outcome</th></tr></thead>
          <tbody>
            {((audit.data ?? []) as Array<{ created_at: string; action: string; resource: string | null; outcome: string | null }>).length === 0 && (
              <tr><td colSpan={4} className="ad-empty">No audit rows.</td></tr>
            )}
            {((audit.data ?? []) as Array<{ created_at: string; action: string; resource: string | null; outcome: string | null }>).map((a, i) => (
              <tr key={i}>
                <td className="ad-mono">{String(a.created_at).slice(0, 16).replace('T', ' ')}</td>
                <td className="ad-mono">{a.action}</td>
                <td className="ad-mono">{a.resource ?? '-'}</td>
                <td className="ad-mono">{a.outcome ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Security signals</h2>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead><tr><th>When</th><th>Event</th><th>Severity</th></tr></thead>
          <tbody>
            {((security.data ?? []) as Array<{ created_at: string; event_type: string; severity: string }>).length === 0 && (
              <tr><td colSpan={3} className="ad-empty">No security signals.</td></tr>
            )}
            {((security.data ?? []) as Array<{ created_at: string; event_type: string; severity: string }>).map((s, i) => (
              <tr key={i}>
                <td className="ad-mono">{String(s.created_at).slice(0, 16).replace('T', ' ')}</td>
                <td className="ad-mono">{s.event_type}</td>
                <td className="ad-mono">{s.severity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
