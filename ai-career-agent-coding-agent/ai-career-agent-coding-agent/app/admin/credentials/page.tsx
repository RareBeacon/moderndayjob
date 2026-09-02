import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import CredentialForm from './CredentialForm';

export const dynamic = 'force-dynamic';

/** Admin • AI credentials, encrypted per-user provider keys.
 *  Server-side gated. Secrets are never rendered back to the browser. */
export default async function AdminCredentialsPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/credentials');

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const { data } = await supabaseAdmin
    .from('ai_credentials')
    .select('user_id,provider,model,status,created_at,key_version')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Array<{
    user_id: string;
    provider: string;
    model: string;
    status: string;
    created_at: string;
    key_version: number;
  }>;

  return (
    <AdminShell active="credentials">
      <h1 className="ad-h1">AI credentials</h1>
      <p className="ad-lede">
        Per-user provider keys, encrypted at rest (AES-256-GCM). Full secrets are never rendered back to
        the browser, only provider, model, and key version.
      </p>

      <CredentialForm />

      <div className="ad-scroll" style={{ marginTop: 28 }}>
        <table className="ad-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Provider</th>
              <th>Model</th>
              <th>Status</th>
              <th>Key version</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="ad-empty">No credentials stored yet.</td>
              </tr>
            )}
            {rows.map((x, i) => (
              <tr key={`${x.user_id}-${i}`}>
                <td className="ad-mono" title={x.user_id}>{x.user_id.slice(0, 8)}…</td>
                <td>{x.provider}</td>
                <td className="ad-mono">{x.model}</td>
                <td>
                  <span className={`ad-chip ${x.status === 'active' ? 'ok' : 'warn'}`}>{x.status}</span>
                </td>
                <td className="ad-mono">v{x.key_version}</td>
                <td className="ad-mono">{x.created_at ? x.created_at.slice(0, 10) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
