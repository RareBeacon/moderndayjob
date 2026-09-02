import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';

export const dynamic = 'force-dynamic';

/** Admin • Security — duplicate-risk review, highest risk first.
 *  Server-side gated (the old client-only fetch had no page-level gate).
 *  Enforcement stays on the server-side termination endpoint. */
export default async function AdminSecurityPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/security');

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const { data } = await supabaseAdmin
    .from('admin_user_overview')
    .select('*')
    .order('risk_score', { ascending: false, nullsFirst: false });

  const rows = (data ?? []) as Array<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    plan: string | null;
    account_status: string | null;
    risk_score: number | null;
  }>;

  return (
    <AdminShell active="security">
      <h1 className="ad-h1">Security</h1>
      <p className="ad-lede">
        Duplicate-risk signals across accounts, highest first. Review before acting — termination is
        enforced through the audited server-side endpoint, never from this page.
      </p>

      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="ad-empty">No accounts to review.</td>
              </tr>
            )}
            {rows.map((x) => (
              <tr key={x.user_id}>
                <td className="ad-mono">{x.email ?? '—'}</td>
                <td>{x.full_name ?? '—'}</td>
                <td>
                  <span className="ad-chip">{x.plan ?? 'unknown'}</span>
                </td>
                <td>
                  <span className={`ad-chip ${x.account_status === 'active' ? 'ok' : 'warn'}`}>
                    {x.account_status ?? 'unknown'}
                  </span>
                </td>
                <td>
                  <span className={`ad-risk ${(x.risk_score ?? 0) >= 50 ? 'high' : ''}`}>{x.risk_score ?? 0}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
