import Link from 'next/link';
import { requireUserOrRedirect } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import {
  CAREER_CATEGORIES,
  INTERVIEW_SESSION_STATES,
  SENIORITY_LEVELS,
  TALENT_DB_STATUSES,
} from '@/lib/talent-pool/constants';
import { adminReviewFilterSchema } from '@/lib/talent-pool/schemas';
import { listAdminTalentApplications } from '@/lib/talent-pool/admin-service';

export const dynamic = 'force-dynamic';

export default async function AdminTalentPoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserOrRedirect('/admin/talent-pool');

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const sp = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v.trim()) flat[k] = v.trim();
  }

  const parsedFilters = adminReviewFilterSchema.safeParse(flat);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : { page: 1, page_size: 20 };

  const queue = await listAdminTalentApplications(user.id, filters);

  return (
    <AdminShell active="talent-pool">
      <h1 className="ad-h1">Talent Pool Review Centre</h1>
      <p className="ad-lede">
        Human-only approval queue. Filter by submission date, status, category, seniority, interview state, score, or
        assigned reviewer. AI never approves or rejects a candidate automatically.
      </p>

      <form method="get" className="ad-form" style={{ maxWidth: '100%', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div>
          <label htmlFor="f-status">Application status</label>
          <select id="f-status" name="status" defaultValue={flat.status ?? ''}>
            <option value="">All statuses</option>
            {TALENT_DB_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-cat">Career category</label>
          <select id="f-cat" name="career_category" defaultValue={flat.career_category ?? ''}>
            <option value="">All categories</option>
            {CAREER_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-lvl">Professional level</label>
          <select id="f-lvl" name="seniority_level" defaultValue={flat.seniority_level ?? ''}>
            <option value="">All levels</option>
            {SENIORITY_LEVELS.map((l) => (
              <option key={l.code} value={l.code}>{l.code}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-int">Interview status</label>
          <select id="f-int" name="interview_state" defaultValue={flat.interview_state ?? ''}>
            <option value="">All interview states</option>
            {INTERVIEW_SESSION_STATES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-min">Min score</label>
          <input id="f-min" name="min_score" type="number" min="0" max="100" defaultValue={flat.min_score ?? ''} />
        </div>

        <div>
          <label htmlFor="f-from">Submitted from</label>
          <input id="f-from" name="submitted_from" type="date" defaultValue={flat.submitted_from ?? ''} />
        </div>

        <div>
          <label htmlFor="f-to">Submitted to</label>
          <input id="f-to" name="submitted_to" type="date" defaultValue={flat.submitted_to ?? ''} />
        </div>

        <div>
          <label htmlFor="f-rev">Assigned reviewer UUID</label>
          <input id="f-rev" name="assigned_reviewer_id" placeholder={user.id} defaultValue={flat.assigned_reviewer_id ?? ''} />
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
          <button type="submit" className="btn btn-sm">Apply filters</button>
          <Link href="/admin/talent-pool" className="btn btn-ghost btn-sm">Reset</Link>
        </div>
      </form>

      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Candidate</th>
              <th>Category &amp; Level</th>
              <th>Application Status</th>
              <th>Interview Status</th>
              <th>Score</th>
              <th>Reviewer</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {queue.items.length === 0 && (
              <tr>
                <td colSpan={8} className="ad-empty">No Talent Pool applications match the current filters.</td>
              </tr>
            )}
            {queue.items.map((item) => (
              <tr key={item.id}>
                <td className="ad-mono">{(item.submitted_at ?? item.created_at).slice(0, 10)}</td>
                <td>
                  <div><strong>{item.candidate_name}</strong></div>
                  <div className="ad-mono muted">{item.candidate_email ?? '-'}</div>
                </td>
                <td>
                  <div>{item.career_category ?? '-'}</div>
                  <span className="ad-chip">{item.seniority_level ?? '-'}</span>
                </td>
                <td>
                  <span className={`ad-chip ${item.status === 'APPROVED' ? 'ok' : item.status === 'UNDER_ADMIN_REVIEW' ? 'warn' : ''}`}>
                    {item.status}
                  </span>
                </td>
                <td className="ad-mono">{item.interview_session?.state ?? 'NONE'}</td>
                <td className="ad-mono">{item.latest_score !== null ? `${item.latest_score}/100` : '-'}</td>
                <td className="ad-mono">{item.assigned_reviewer_id ? item.assigned_reviewer_id.slice(0, 8) : 'Unassigned'}</td>
                <td>
                  <Link className="inline-link" href={`/admin/talent-pool/${item.id}`}>
                    Inspect &amp; decide
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
