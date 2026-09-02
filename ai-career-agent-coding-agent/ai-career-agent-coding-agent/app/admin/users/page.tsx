import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';

export const dynamic = 'force-dynamic';

/** Admin • Users — dense ruled table over the admin_user_overview view.
 *  Server-side gated: unauthenticated → login, non-admin → forbidden. */
export default async function AdminUsersPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/users');

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const { data } = await supabaseAdmin
    .from('admin_user_overview')
    .select('*')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Array<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    plan: string | null;
    account_status: string | null;
    risk_score: number | null;
    created_at: string | null;
  }>;

  return (
    <AdminShell active="users">
      <h1 className="ad-h1">Users</h1>
      <p className="ad-lede">
        Every account with plan, status, and duplicate-risk signal. Termination is enforced through the
        server-side endpoint only — never from this page.
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
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="ad-empty">No users yet.</td>
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
                <td className="ad-mono">{x.risk_score ?? 0}</td>
                <td className="ad-mono">{x.created_at ? x.created_at.slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>
        {rows.length} account{rows.length === 1 ? '' : 's'}. Risk score is a duplicate/abuse signal from
        the overview view — investigate before acting.
      </p>
    </AdminShell>
  );
}
