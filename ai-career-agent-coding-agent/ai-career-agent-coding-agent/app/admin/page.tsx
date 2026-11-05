import Link from 'next/link';
import { AdminForbidden, AdminShell } from '@/components/site/AdminShell';
import { getAdminContext, hasAdminPermission } from '@/lib/admin';
import { requireUserOrRedirect } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { PLANS } from '@/packages/shared/plans';

export const dynamic = 'force-dynamic';

type RangeKey = 'today' | '7d' | '30d' | 'all';

function resolveRangeStart(range: RangeKey): string | null {
  const now = Date.now();
  if (range === 'today') return new Date(now - 24 * 3_600_000).toISOString();
  if (range === '7d') return new Date(now - 7 * 86_400_000).toISOString();
  if (range === '30d') return new Date(now - 30 * 86_400_000).toISOString();
  return null;
}

function fmtMoney(amount: number, currency: 'NGN' | 'USD'): string {
  if (currency === 'NGN') {
    return `₦${Math.round(amount).toLocaleString('en-US')}`;
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function AdminControlCentrePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUserOrRedirect('/admin');
  const admin = await getAdminContext(user.id, user.email ?? null);
  if (!admin) return <AdminForbidden />;

  const sp = await searchParams;
  const range: RangeKey =
    sp?.range === 'today' || sp?.range === '7d' || sp?.range === '30d' || sp?.range === 'all'
      ? sp.range
      : '30d';
  const sinceIso = resolveRangeStart(range);
  const canViewAnalytics = hasAdminPermission(admin, 'can_view_analytics');
  const canViewAudit = hasAdminPermission(admin, 'can_view_audit_logs');

  const countSince = async (table: string, col = 'created_at', extraEq?: [string, string | boolean]) => {
    let q = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
    if (sinceIso) q = q.gte(col, sinceIso);
    if (extraEq) q = q.eq(extraEq[0], extraEq[1]);
    const { count } = await q;
    return count ?? 0;
  };

  const countTotal = async (table: string, extraEq?: [string, string | boolean]) => {
    let q = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
    if (extraEq) q = q.eq(extraEq[0], extraEq[1]);
    const { count } = await q;
    return count ?? 0;
  };

  const [
    totalUsers,
    newUsersInRange,
    totalDrafts,
    draftsInRange,
    totalDocs,
    docsInRange,
    publishedPortfolios,
    submittedAppsTotal,
    submittedAppsRange,
    failedAppsRange,
    awaitingApprovalApps,
    talentPoolTotal,
    employerOrgsTotal,
    openTickets,
    subscriptionsRes,
    paymentsRes,
    programmeRes,
    adminMembersRes,
    recentAuditRes,
  ] = await Promise.all([
    countTotal('profiles'),
    countSince('profiles'),
    countTotal('resume_studio_drafts'),
    countSince('resume_studio_drafts'),
    countTotal('generated_documents'),
    countSince('generated_documents'),
    countTotal('portfolios', ['visibility', 'PUBLIC']),
    countTotal('applications', ['status', 'SUBMITTED']),
    countSince('applications', 'submitted_at', ['status', 'SUBMITTED']),
    countSince('applications', 'created_at', ['status', 'FAILED']),
    countTotal('applications', ['status', 'AWAITING_APPROVAL']),
    countTotal('talent_pool_profiles'),
    countTotal('employer_organizations'),
    countTotal('support_tickets', ['status', 'OPEN']),
    supabaseAdmin
      .from('subscriptions')
      .select('plan, status, source, current_period_end'),
    canViewAnalytics
      ? supabaseAdmin
          .from('payments')
          .select('amount, currency, status, provider, created_at')
          .order('created_at', { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] }),
    supabaseAdmin
      .from('programme_applications')
      .select('track, status, priority_band, partnership_market, verified_partner, partnership_verified'),
    supabaseAdmin
      .from('admin_users')
      .select('user_id, role, is_owner, is_active, require_mfa'),
    canViewAudit
      ? supabaseAdmin
          .from('admin_audit_logs')
          .select('id, actor_role, action, target_type, target_id, reason, created_at')
          .order('created_at', { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
  ]);

  // Subscription Breakdown: strictly separate Verified Paying Subscribers from ADMIN_GRANT complimentary grants!
  const nowMs = Date.now();
  const subs = (subscriptionsRes.data ?? []) as Array<{
    plan: string;
    status: string;
    source?: string | null;
    current_period_end?: string | null;
  }>;

  const isSubActive = (s: { status: string; current_period_end?: string | null }) =>
    String(s.status ?? '').startsWith('ACTIVE') &&
    (!s.current_period_end || new Date(s.current_period_end).getTime() > nowMs);

  const paidByTier = { BASIC: 0, PREMIUM: 0, ULTRA: 0 };
  const adminGrantByTier = { BASIC: 0, PREMIUM: 0, ULTRA: 0 };

  for (const s of subs) {
    if (!isSubActive(s)) continue;
    const planKey = s.plan === 'MAX' ? 'ULTRA' : s.plan;
    if (planKey !== 'BASIC' && planKey !== 'PREMIUM' && planKey !== 'ULTRA') continue;
    if (s.source === 'ADMIN_GRANT') {
      adminGrantByTier[planKey] += 1;
    } else {
      paidByTier[planKey] += 1;
    }
  }

  const totalVerifiedPayingSubs = paidByTier.BASIC + paidByTier.PREMIUM + paidByTier.ULTRA;
  const totalAdminGrants = adminGrantByTier.BASIC + adminGrantByTier.PREMIUM + adminGrantByTier.ULTRA;

  // Estimated Verified-Only Run-Rate MRR (strictly excludes ADMIN_GRANT rows).
  const verifiedNgnRunRateMrr =
    paidByTier.BASIC * PLANS.BASIC.monthlyNgn +
    paidByTier.PREMIUM * PLANS.PREMIUM.monthlyNgn +
    paidByTier.ULTRA * PLANS.ULTRA.monthlyNgn;

  // Verified Collected Cash Revenue from public.payments (SUCCEEDED / SUCCESS / COMPLETED / PAID only).
  const verifiedStatuses = new Set(['SUCCEEDED', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID']);
  const paymentRows = (paymentsRes.data ?? []) as Array<{
    amount: number;
    currency: string;
    status: string;
    provider: string;
    created_at: string;
  }>;

  let collectedNgnRange = 0;
  let collectedUsdRange = 0;
  let collectedNgnAll = 0;
  let collectedUsdAll = 0;

  for (const p of paymentRows) {
    if (!verifiedStatuses.has(String(p.status ?? '').toUpperCase())) continue;
    const amt = Number(p.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const curr = String(p.currency ?? 'NGN').toUpperCase();
    const inRange = !sinceIso || p.created_at >= sinceIso;
    if (curr === 'USD') {
      collectedUsdAll += amt;
      if (inRange) collectedUsdRange += amt;
    } else {
      collectedNgnAll += amt;
      if (inRange) collectedNgnRange += amt;
    }
  }

  // Programme & Partnerships Scorecard metrics
  const progRows = (programmeRes.data ?? []) as Array<{
    track: string;
    status: string;
    priority_band: string;
    partnership_market: string | null;
    partnership_verified?: boolean;
    verified_partner?: boolean;
  }>;
  const isVerified = (r: { verified_partner?: boolean; partnership_verified?: boolean }) =>
    Boolean(r.partnership_verified ?? r.verified_partner);
  const verifiedUsPartners = progRows.filter(
    (r) => r.track === 'PARTNER' && r.partnership_market === 'US' && isVerified(r),
  ).length;
  const verifiedUkPartners = progRows.filter(
    (r) => r.track === 'PARTNER' && r.partnership_market === 'UK' && isVerified(r),
  ).length;
  const verifiedTotalUsUkPartners = verifiedUsPartners + verifiedUkPartners;
  const activeFoundingContributors = progRows.filter(
    (r) => r.status === 'ACCEPTED' || r.status === 'TRIAL_60_DAY',
  ).length;

  const adminMembers = (adminMembersRes.data ?? []) as Array<{
    role?: string;
    is_owner?: boolean;
    is_active?: boolean;
    require_mfa?: boolean;
  }>;
  const activeAdmins = adminMembers.filter((m) => m.is_active !== false);

  return (
    <AdminShell active="overview">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="mk-kicker">Owner Control Centre · Role: {admin.role}</span>
          <h1 className="ad-h1" style={{ marginTop: 4 }}>Jobiest Platform Operations &amp; 2036 Scorecard</h1>
          <p className="ad-lede">
            Verified production telemetry, subscription economics (strictly separated from admin grants), Founding Team
            &amp; US/UK Partnerships pipeline, and immutable RBAC audit trail.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="navigation" aria-label="Analytics time range">
          {([
            ['today', '24h'],
            ['7d', '7 days'],
            ['30d', '30 days'],
            ['all', 'All time'],
          ] as const).map(([key, label]) => (
            <Link
              key={key}
              href={`/admin?range=${key}`}
              className="ad-chip"
              style={{
                textDecoration: 'none',
                fontWeight: range === key ? 700 : 500,
                outline: range === key ? '2px solid #2563eb' : undefined,
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* SECTION 1: JOBIEST 2036 STRATEGIC SCORECARD */}
      <h2 style={{ fontSize: 18, marginTop: 24, marginBottom: 10 }}>
        Jobiest 2036 Founder Scorecard (Live Milestone Tracking)
      </h2>
      <div className="grid grid-4" style={{ gap: 12 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>Milestone 1A · By 31 Mar 2027</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Structured Talent Pool</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
            {talentPoolTotal.toLocaleString('en-US')}{' '}
            <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>/ 1,000</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Total registered accounts: {totalUsers.toLocaleString('en-US')}
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>Milestone 1B · By 31 Mar 2027</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Verified Paying Subscribers</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
            {totalVerifiedPayingSubs}{' '}
            <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>/ 100</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Excludes {totalAdminGrants} complimentary admin grant{totalAdminGrants === 1 ? '' : 's'}
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>Milestone 1C · By 31 Mar 2027</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Documented US + UK Partnerships</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
            {verifiedTotalUsUkPartners}{' '}
            <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>/ 50</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            US: {verifiedUsPartners}/30 · UK: {verifiedUkPartners}/20 ·{' '}
            <Link className="inline-link" href="/admin/programme">Open CRM</Link>
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>Milestone 2 · May 2027 - Dec 2028</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Verified Gross Revenue Target</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
            {canViewAnalytics ? fmtMoney(collectedUsdAll, 'USD') : 'Restricted'}{' '}
            <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>/ $100,000</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            + {canViewAnalytics ? fmtMoney(collectedNgnAll, 'NGN') : '-'} verified NGN receipts
          </div>
        </div>
      </div>

      {/* SECTION 2: VERIFIED REVENUE & SUBSCRIPTION TIER MIX */}
      {canViewAnalytics && (
        <>
          <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 10 }}>
            Monetisation &amp; Subscription Ledger ({range === 'all' ? 'All time' : `Last ${range}`})
          </h2>
          <div className="grid grid-4" style={{ gap: 12 }}>
            <div className="panel" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>Verified Paid Run-Rate MRR</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
                {fmtMoney(verifiedNgnRunRateMrr, 'NGN')}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Mar 2027 baseline target: ₦750,000/mo
              </div>
            </div>

            <div className="panel" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>Collected Cash (NGN · {range})</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
                {fmtMoney(collectedNgnRange, 'NGN')}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Paystack + Flutterwave verified webhooks
              </div>
            </div>

            <div className="panel" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>Collected Cash (USD · {range})</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
                {fmtMoney(collectedUsdRange, 'USD')}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Dodo + international card settlements
              </div>
            </div>

            <div className="panel" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>Active Paid Tier Distribution</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 8, lineHeight: 1.7 }}>
                <div>Basic (30 apps/mo): <strong>{paidByTier.BASIC}</strong> paid · {adminGrantByTier.BASIC} grant</div>
                <div>Premium (50 apps/mo): <strong>{paidByTier.PREMIUM}</strong> paid · {adminGrantByTier.PREMIUM} grant</div>
                <div>Ultra (Unlimited*): <strong>{paidByTier.ULTRA}</strong> paid · {adminGrantByTier.ULTRA} grant</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SECTION 3: CORE PRODUCT, RESUME STUDIO & APPLICATION ENGINE HEALTH */}
      <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 10 }}>
        Platform Usage, Resume Studio &amp; Application Quota Integrity
      </h2>
      <div className="grid grid-4" style={{ gap: 12 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>New Signups ({range})</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{newUsersInRange}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            <Link className="inline-link" href="/admin/users">Manage {totalUsers} total users →</Link>
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>Resume Studio Drafts &amp; Docs</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{totalDrafts} drafts</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            +{draftsInRange} drafts &amp; +{docsInRange} tailored docs ({totalDocs} total) · {publishedPortfolios} public portfolios
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>Confirmed Submitted Applications</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{submittedAppsTotal}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            +{submittedAppsRange} in {range} · {awaitingApprovalApps} awaiting approval · {failedAppsRange} failed (0 quota charged)
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>Support, Employers &amp; Founding Network</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{openTickets} open tickets</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {employerOrgsTotal} employer orgs · {activeFoundingContributors}/15 founding contributors
          </div>
        </div>
      </div>

      {/* SECTION 4: SECURITY, RBAC & IMMUTABLE ADMIN AUDIT TRAIL */}
      <div className="grid grid-2" style={{ gap: 16, marginTop: 28 }}>
        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>3-Tier RBAC &amp; MFA Governance</h2>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
            Active administrators: <strong>{activeAdmins.length}</strong> (Owner: {activeAdmins.filter((a) => a.is_owner).length}, Sub-Admin:{' '}
            {activeAdmins.filter((a) => !a.is_owner && a.role === 'SUB_ADMIN').length}, Staff:{' '}
            {activeAdmins.filter((a) => a.role === 'STAFF').length}). Mandatory TOTP + single-use recovery code enforcement active.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn btn-ghost btn-sm" href="/admin/team">Admin Team &amp; RBAC</Link>
            <Link className="btn btn-ghost btn-sm" href="/admin/email">Email Infrastructure ($0/mo)</Link>
            <Link className="btn btn-ghost btn-sm" href="/admin/security">Security Events</Link>
            <Link className="btn btn-ghost btn-sm" href="/settings">2FA &amp; Recovery Codes</Link>
            <Link className="btn btn-ghost btn-sm" href="/apply" target="_blank">Public /apply Portal ↗</Link>
          </div>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>10-Year Horizon Checkpoints (2026 - 2036)</h2>
          <div style={{ fontSize: 12.5, lineHeight: 1.75 }}>
            <div><strong>2026-2027 (Validation):</strong> 1,000 talent · 100 paid subs · 50 US/UK partners</div>
            <div><strong>2027-2028 (Commercialization):</strong> $100,000 cumulative verified gross revenue</div>
            <div><strong>2029-2030 (Regional Africa):</strong> NG, GH, KE, ZA, UG, RW · 250K pros · $3M-$5M ARR</div>
            <div><strong>2031-2032 (Global Market Entry):</strong> US, UK, CA, EU · 1M pros · $15M-$25M ARR</div>
            <div><strong>2033-2036 (Enterprise &amp; Unicorn Scale):</strong> 10M+ pros · 10K+ employers · $100M-$150M ARR</div>
          </div>
        </div>
      </div>

      {canViewAudit && (
        <>
          <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 10 }}>
            Recent Immutable Admin Audit Logs
          </h2>
          <div className="ad-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor Role</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {((recentAuditRes.data ?? []) as Array<{
                  id: string;
                  actor_role: string;
                  action: string;
                  target_type: string;
                  target_id: string | null;
                  reason: string | null;
                  created_at: string;
                }>).length === 0 && (
                  <tr>
                    <td colSpan={5} className="ad-empty">No administrative mutations logged yet.</td>
                  </tr>
                )}
                {((recentAuditRes.data ?? []) as Array<{
                  id: string;
                  actor_role: string;
                  action: string;
                  target_type: string;
                  target_id: string | null;
                  reason: string | null;
                  created_at: string;
                }>).map((row) => (
                  <tr key={row.id}>
                    <td className="ad-mono">{String(row.created_at).slice(0, 19).replace('T', ' ')}</td>
                    <td><span className="ad-chip">{row.actor_role}</span></td>
                    <td className="ad-mono">{row.action}</td>
                    <td className="ad-mono">{row.target_type}{row.target_id ? `:${row.target_id.slice(0, 8)}` : ''}</td>
                    <td>{row.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}
