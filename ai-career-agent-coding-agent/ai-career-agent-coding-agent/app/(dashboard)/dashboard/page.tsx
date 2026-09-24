import Link from 'next/link';
import ProfileReadiness from '@/components/ProfileReadiness';
import { DashboardSetup } from '@/components/site/DashboardSetup';
import { AppShell } from '@/components/site/AppShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { auditEvent } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase';
import { getEntitlement } from '@packages/security/entitlements';
import { getProfileCompleteness } from '@/lib/profile-completeness';
import { isGatedCohort, ONBOARDING_THRESHOLD } from '@/lib/onboarding-gate';
import { buildBoardLinks, isRemoteOnly } from '@/lib/boardlinks';
import { creditAvailable } from '@/lib/credits';
import { AutoSubmitToggle } from '@/components/site/AutoSubmitToggle';

type DraftApp = {
  id: string;
  created_at: string;
  jobs: { company: string | null; title: string | null; url: string | null } | null;
};

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Dashboard, the one clear home for a signed-in user. A greeting, one primary
 * action (Start an application), honest counts from the database, drafts
 * awaiting approval, and the next step; nothing else. Users bring the jobs
 * they want; this page never dumps a listings pool.
 */
export default async function Dashboard() {
  // Stale or rotated session (seen live 2026-09-24: an iOS Safari user right
  // after Google signup + account completion) must redirect to login, not
  // crash into the error boundary. requireUserOrRedirect triages every auth
  // outcome (anonymous, MFA, suspended); anything else still thrown is
  // captured server-side below before reaching the boundary.
  const user = await requireUserOrRedirect('/dashboard');
  try {
    return await DashboardBody(user);
  } catch (error) {
    // Keep the boundary UX, but record the real server-side cause: the
    // client error reporter only sees a redacted message.
    void auditEvent({
      action: 'SERVER_RENDER_ERROR',
      resource: 'dashboard',
      outcome: 'error',
      meta: {
        message: String((error as Error)?.message ?? error).slice(0, 400),
        userId: user.id,
      },
    });
    throw error;
  }
}

async function DashboardBody(user: Awaited<ReturnType<typeof requireUserOrRedirect>>): Promise<import('react').ReactNode> {
  const [
    { data: profile },
    { data: career },
    { data: preferences },
    entitlement,
    completeness,
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name,target_roles,account_status').eq('user_id', user.id).single(),
    supabaseAdmin.from('career_profiles').select('headline,skills').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('job_preferences').select('remote_types,locations,application_mode').eq('user_id', user.id).maybeSingle(),
    // Display-only: an entitlements hiccup (missing row, transient read
    // error) must not take the whole dashboard down. The safe fallback shows
    // the FREE plan; every real gate is enforced server-side per action.
    getEntitlement(user.id).catch(() => ({
      plan: 'FREE' as const,
      account_status: 'ACTIVE' as const,
      subscription_status: null,
      trial_ends_at: null,
      automation_enabled: false,
      ai_credits_remaining: 0,
      applications_remaining: 0,
      tool_uses_remaining: null,
    })),
    getProfileCompleteness(user.id).catch(() => ({ percent: 0, next: [], checks: [] })),
  ]);

  const setupRequired = isGatedCohort(user.created_at) && completeness.percent < ONBOARDING_THRESHOLD;

  const boardLinks = buildBoardLinks({
    targetRoles: profile?.target_roles ?? [],
    locations: preferences?.locations ?? [],
    remoteOnly: isRemoteOnly(preferences?.remote_types),
  });

  // Mode-aware copy: an 'auto' user has delegated the send itself; every
  // other mode keeps the "nothing is sent without your approval" promise.
  const autoMode = preferences?.application_mode === 'auto';

  const [
    { count: applicationCount },
    { count: inFlightCount },
    { count: interviewCount },
    { count: draftCount },
    { data: drafts },
    pipelineCounts,
    docCredits,
    appCredits,
    { data: activation },
    { count: portfolioCount },
  ] = await Promise.all([
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['SUBMITTED', 'INTERVIEW']),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'INTERVIEW'),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'DRAFT'),
    supabaseAdmin.from('applications').select('id,created_at,jobs(company,title,url)').eq('user_id', user.id).eq('status', 'DRAFT').order('created_at', { ascending: false }).limit(4),
    // Command Center (§2.6): the pipeline split by stage. Prepared = being
    // readied or awaiting you; Submitted = confirmed sent; Verified = the
    // employer moved you forward (interview).
    supabaseAdmin.from('applications').select('status').eq('user_id', user.id).limit(500),
    creditAvailable(user.id, 'DOCUMENT').catch(() => null),
    creditAvailable(user.id, 'AUTO_APPLY').catch(() => null),
    supabaseAdmin.from('auto_apply_activations').select('status, card_last4, bank').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('portfolios').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ]);

  const statusTally = new Map<string, number>();
  for (const row of ((pipelineCounts as unknown as { status: string }[] | null) ?? [])) {
    statusTally.set(row.status, (statusTally.get(row.status) ?? 0) + 1);
  }
  const tally = (...statuses: string[]) => statuses.reduce((sum, s) => sum + (statusTally.get(s) ?? 0), 0);
  const preparedCount = tally('DRAFT', 'PREPARING', 'AWAITING_APPROVAL', 'APPROVED', 'QUEUED', 'AWAITING_USER_INPUT');
  const sentCount = statusTally.get('SUBMITTED') ?? 0;
  const checkingCount = statusTally.get('AWAITING_VERIFICATION') ?? 0;

  const draftApps = (drafts ?? []) as unknown as DraftApp[];
  const draftsWaiting = draftCount ?? 0;
  const inFlight = inFlightCount ?? 0;
  const interviews = interviewCount ?? 0;
  const responseRate = inFlight > 0 ? Math.round((interviews / inFlight) * 100) : 0;

  const firstName = (profile?.full_name || user.email?.split('@')[0] || 'there').split(' ')[0];
  const lagosHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date()),
  );
  const greeting = greetingForHour(Number.isFinite(lagosHour) ? lagosHour : 12);

  // Command Center quota line: the credit ledger is the source of truth
  // after the M2 go-live flip (monthly matrix, D1). Falls back to the
  // legacy entitlement numbers if the ledger cannot be read.
  const quotaLine =
    docCredits !== null
      ? `${docCredits} document credit${docCredits === 1 ? '' : 's'} left this month`
      : entitlement.plan === 'FREE'
        ? `${entitlement.ai_credits_remaining} of 3 free documents left`
        : `${entitlement.ai_credits_remaining} AI generations today`;
  const activationActive = (activation as { status?: string } | null)?.status === 'ACTIVE';

  // Deterministic, real-derived next steps (no fabricated suggestions).
  const suggestions: { text: string; href: string }[] = [];
  if (completeness.percent < 100) suggestions.push({ text: `Finish your profile, ${completeness.percent}% complete for stronger matches.`, href: '/profile' });
  if ((applicationCount ?? 0) === 0) suggestions.push({ text: 'Track your first application to start your history.', href: '/applications' });
  if (autoMode) suggestions.push({ text: 'Automatic submission is on; your agent applies within your rules.', href: '/applications' });
  else if (entitlement.automation_enabled) suggestions.push({ text: 'Agent mode is on for your plan; bring a job link to begin.', href: '/applications' });
  if (!entitlement.automation_enabled && !activationActive) {
    suggestions.push({ text: 'Unlock 5 free auto-applies a month: verify a card once (the check costs nothing).', href: '/auto-apply/activation' });
  }
  if ((portfolioCount ?? 0) === 0) suggestions.push({ text: 'Create your portfolio page and share one link with recruiters.', href: '/portfolios' });
  if (suggestions.length === 0) suggestions.push({ text: 'Refresh your CV and run an ATS check for your next role.', href: '/generate' });

  return (
    <AppShell active="dashboard" title="Dashboard">
      <div className="dd-banner" role="note">
        {autoMode ? (
          <>
            Your application is free. Jobiest never asks candidates for money. Automatic submission
            is on for your account and we email you after every submission.
          </>
        ) : (
          <>
            Your application is free. Jobiest never asks candidates for money, and nothing is ever
            sent without your approval.
          </>
        )}
      </div>

      <header className="dd-head">
        <span className="dd-over">Dashboard</span>
        <h1>{greeting}, {firstName}.</h1>
        <p>Let&apos;s get your next application moving.</p>
        <div className="dd-cta-row">
          <Link className="btn" href="/applications">Start an application</Link>
        </div>
        <span className="dd-meta">Plan · {entitlement.plan} · {quotaLine}</span>
      </header>
      <div className="dd-rule" aria-hidden="true" />

      {/* setup questions live here now: invited, never forced (no redirect) */}
      <DashboardSetup needsSetup={!profile?.target_roles?.length} required={setupRequired} />

      <section className="dd-stats" aria-label="Your numbers">
        <div className="dd-stat"><b>{applicationCount ?? 0}</b><span>Applications</span></div>
        <div className="dd-stat"><b>{interviews}</b><span>Interviews</span></div>
        <div className="dd-stat"><b>{responseRate}%</b><span>Response rate</span></div>
        <div className="dd-stat"><b>{completeness.percent}%</b><span>Profile strength</span></div>
      </section>

      <section className="dd-sec" aria-label="Application pipeline">
        <span className="dd-over">Pipeline</span>
        <div className="dd-stats">
          <div className="dd-stat"><b>{preparedCount}</b><span>Prepared or awaiting you</span></div>
          <div className="dd-stat"><b>{checkingCount}</b><span>Checking send</span></div>
          <div className="dd-stat"><b>{sentCount}</b><span>Submitted</span></div>
          <div className="dd-stat"><b>{interviews}</b><span>Verified (interview)</span></div>
        </div>
        <p className="muted dd-note">
          Auto-apply credits: {appCredits ?? 0} left this month
          {entitlement.automation_enabled ? '' : activationActive ? '' : ' · unlock 5 free with a card check'}
          {(portfolioCount ?? 0) > 0 ? ` · ${(portfolioCount ?? 0)} portfolio${portfolioCount === 1 ? '' : 's'}` : ''}
        </p>
      </section>

      <div className="dd-cols">
        <div className="dd-main">
          {draftApps.length > 0 && (
            <section className="dd-sec" aria-label="Awaiting your approval">
              <span className="dd-over">Awaiting your approval</span>
              <ul className="dd-rows">
                {draftApps.map((a) => (
                  <li key={a.id} className="dd-row">
                    <div>
                      <b>{a.jobs?.title || 'Untitled role'}</b>
                      <span>{a.jobs?.company || 'Unknown company'}</span>
                    </div>
                    <Link className="inline-link" href="/applications">Review →</Link>
                  </li>
                ))}
              </ul>
              <p className="muted dd-note">Drafts are prepared from your verified facts only. Approve, edit, or reject, your call, every time.</p>
            </section>
          )}

          <section className="dd-sec" aria-label="Your next application">
            <span className="dd-over">Your next application</span>
            <div className="dd-empty">
              <p className="muted">
                Bring the job you want as a link or a description. Your agent prepares a truthful,
                tailored package and you approve every send.
              </p>
              <Link className="inline-link" href="/applications">Start an application →</Link>
            </div>
          </section>
        </div>

        <aside className="dd-side">
          <section className="dd-sec" aria-label="Automatic submission">
            <span className="dd-over">Automatic submission</span>
            <AutoSubmitToggle
              initialMode={preferences?.application_mode ?? 'approval'}
              planIncludesAutomation={entitlement.automation_enabled}
              sendingLive={process.env.AUTOMATION_SUBMIT_ENABLED === 'true'}
            />
          </section>

          {boardLinks.length > 0 && (
            <section className="dd-sec" aria-label="Browse the big boards yourself">
              <span className="dd-over">Browse the boards yourself</span>
              <ul className="dd-suggest">
                {boardLinks.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} className="inline-link" target="_blank" rel="noopener noreferrer">
                      {l.boardLabel}: {l.role}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="muted dd-note">
                Search links built from your roles and locations. Your agent applies through employers&apos; own
                career sites; these boards are for your own browsing.
              </p>
            </section>
          )}

          <section className="dd-sec">
            <span className="dd-over">Next steps</span>
            <ul className="dd-suggest">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <Link href={s.href} className="inline-link">{s.text}</Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="dd-sec">
            <span className="dd-over">Profile readiness</span>
            <ProfileReadiness />
          </section>

          {career?.headline && <p className="muted dd-note">{career.headline}</p>}
        </aside>
      </div>
    </AppShell>
  );
}
