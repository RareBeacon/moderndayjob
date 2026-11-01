import { requireUserOrRedirect } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import { listAdminEmployers } from '@/lib/talent-pool/admin-service';
import { safeExternalHref } from '@/lib/security/safe-url';
import { AdminEmployerActionsClient } from './AdminEmployerActionsClient';

export const dynamic = 'force-dynamic';

export default async function AdminEmployersPage() {
  const user = await requireUserOrRedirect('/admin/employers');
  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const data = await listAdminEmployers(user.id).catch(() => ({
    organizations: [],
    reports: [],
  }));
  const orgs = data.organizations as Array<{
    id: string;
    company_name: string;
    website_url: string;
    industry: string;
    company_location: string;
    business_email: string;
    authorized_representative_name: string;
    verification_status: string;
    created_at: string;
  }>;
  const reports = data.reports as Array<{
    id: string;
    reporter_role: string;
    reason_category: string;
    details: string;
    status: string;
    created_at: string;
  }>;

  return (
    <AdminShell active="employers">
      <h1 className="ad-h1">Employers &amp; Recruitment Operations</h1>
      <p className="ad-lede">
        Verify employer organizations before Talent Pool search unlocks, and monitor interaction reports across the
        marketplace.
      </p>

      <div className="ad-scroll" style={{ marginBottom: 28 }}>
        <table className="ad-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Industry &amp; Location</th>
              <th>Business Email</th>
              <th>Representative</th>
              <th>Status</th>
              <th>Registered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && (
              <tr>
                <td colSpan={7} className="ad-empty">No employer organizations registered yet.</td>
              </tr>
            )}
            {orgs.map((org) => (
              <tr key={org.id}>
                <td>
                  <div><strong>{org.company_name}</strong></div>
                  {(() => {
                    const safeHref = safeExternalHref(org.website_url);
                    return safeHref ? (
                      <a href={safeHref} target="_blank" rel="noopener noreferrer" className="inline-link ad-mono">
                        {org.website_url}
                      </a>
                    ) : (
                      <span className="ad-mono muted">{org.website_url || '-'}</span>
                    );
                  })()}
                </td>
                <td>{org.industry} · {org.company_location}</td>
                <td className="ad-mono">{org.business_email}</td>
                <td>{org.authorized_representative_name}</td>
                <td>
                  <span className={`ad-chip ${org.verification_status === 'VERIFIED' ? 'ok' : 'warn'}`}>
                    {org.verification_status}
                  </span>
                </td>
                <td className="ad-mono">{org.created_at.slice(0, 10)}</td>
                <td>
                  <AdminEmployerActionsClient
                    organizationId={org.id}
                    currentStatus={org.verification_status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 19, marginBottom: 10 }}>Reported Interactions</h2>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reporter Role</th>
              <th>Reason</th>
              <th>Details</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr>
                <td colSpan={5} className="ad-empty">No inappropriate interaction reports filed.</td>
              </tr>
            )}
            {reports.map((rep) => (
              <tr key={rep.id}>
                <td className="ad-mono">{rep.created_at.slice(0, 10)}</td>
                <td><span className="ad-chip">{rep.reporter_role}</span></td>
                <td>{rep.reason_category}</td>
                <td>{rep.details}</td>
                <td><span className="ad-chip">{rep.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
