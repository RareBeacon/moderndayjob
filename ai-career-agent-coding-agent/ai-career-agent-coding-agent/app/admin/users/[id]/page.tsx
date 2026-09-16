import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import RevealEmail from './RevealEmail';

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

  const [profile, subscription, lifetime, usage, apps, audit, security] = await Promise.all([
    supabaseAdmin.from('profiles').select('user_id,email,full_name,account_status,created_at').eq('user_id', id).maybeSingle(),
    supabaseAdmin.from('subscriptions').select('plan,status').eq('user_id', id).maybeSingle(),
    supabaseAdmin.from('usage_lifetime').select('docs_used,tools_used').eq('user_id', id).maybeSingle(),
    supabaseAdmin.from('ai_usage').select('created_at,feature,provider,status,latency_ms').eq('user_id', id).order('created_at', { ascending: false }).limit(15),
    supabaseAdmin.from('applications').select('id,status,created_at,jobs(company,title)').eq('user_id', id).order('created_at', { ascending: false }).limit(8),
    supabaseAdmin.from('audit_logs').select('action,resource,outcome,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(15),
    supabaseAdmin.from('security_events').select('event_type,severity,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(8),
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
