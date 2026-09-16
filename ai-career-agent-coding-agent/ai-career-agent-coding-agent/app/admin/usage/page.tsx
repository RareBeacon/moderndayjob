import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';

export const dynamic = 'force-dynamic';

/**
 * Admin • AI usage (B-061 cost dashboard). Server-side gated like the other
 * admin pages; renders 30 days of the ai_usage ledger as day bars plus
 * feature/provider tables. The API twin (/api/admin/analytics/usage) exists
 * for programmatic monitoring.
 */
export default async function AdminUsagePage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/usage');

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('ai_usage')
    .select('created_at,feature,provider,status,latency_ms,user_id')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20000);

  const rows = (data ?? []) as Array<{
    created_at: string; feature: string; provider: string;
    status: string; latency_ms: number | null; user_id: string | null;
  }>;

  const total = rows.length;
  const errors = rows.filter((r) => r.status !== 'ok').length;
  const blocked = rows.filter((r) => r.status === 'blocked').length;
  const anonymous = rows.filter((r) => !r.user_id).length;
  const avgLatency = total ? Math.round(rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / total) : 0;

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = r.created_at.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxDay = Math.max(1, ...days.map(([, n]) => n));

  const byFeature = new Map<string, { total: number; errors: number }>();
  for (const r of rows) {
    const f = byFeature.get(r.feature) ?? { total: 0, errors: 0 };
    f.total += 1;
    if (r.status !== 'ok') f.errors += 1;
    byFeature.set(r.feature, f);
  }
  const features = [...byFeature.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <AdminShell active="usage">
      <h1 className="ad-h1">AI usage</h1>
      <p className="ad-lede">
        Every generation, provider-backed or deterministic, writes one ledger row. Last 30 days.
        Retention target: 12 months.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0' }}>
        {[
          ['Runs', String(total)],
          ['Errors', String(errors)],
          ['Blocked (quota)', String(blocked)],
          ['Anonymous', String(anonymous)],
          ['Avg latency', `${avgLatency} ms`],
        ].map(([label, value]) => (
          <div key={label} style={{ border: '1px solid #d8d3c8', borderRadius: 10, padding: '10px 16px', minWidth: 130 }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr><th>Day</th><th style={{ width: '55%' }}>Volume</th><th>Runs</th></tr>
          </thead>
          <tbody>
            {days.length === 0 && (
              <tr><td colSpan={3} className="ad-empty">No usage recorded yet. It starts flowing once generation endpoints run.</td></tr>
            )}
            {days.map(([d, n]) => (
              <tr key={d}>
                <td className="ad-mono">{d}</td>
                <td>
                  <div style={{ background: '#123f2f', height: 10, borderRadius: 5, width: `${Math.max(2, (n / maxDay) * 100)}%` }} aria-label={`${n} runs`} />
                </td>
                <td className="ad-mono">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ad-scroll" style={{ marginTop: 24 }}>
        <table className="ad-table">
          <thead>
            <tr><th>Feature</th><th>Runs</th><th>Errors</th></tr>
          </thead>
          <tbody>
            {features.length === 0 && (
              <tr><td colSpan={3} className="ad-empty">-</td></tr>
            )}
            {features.map(([f, s]) => (
              <tr key={f}>
                <td className="ad-mono">{f}</td>
                <td className="ad-mono">{s.total}</td>
                <td className="ad-mono">{s.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
