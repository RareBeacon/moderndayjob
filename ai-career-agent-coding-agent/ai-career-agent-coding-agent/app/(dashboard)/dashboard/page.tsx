import Link from 'next/link';
import ProfileReadiness from '@/components/ProfileReadiness';
import { DashboardSetup } from '@/components/site/DashboardSetup';
import { AppShell } from '@/components/site/AppShell';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getEntitlement } from '@packages/security/entitlements';
import { getProfileCompleteness } from '@/lib/profile-completeness';
import { buildBoardLinks, isRemoteOnly } from '@/lib/boardlinks';

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
  const user = await requireUser();
  const [
    { data: profile },
    { data: career },
    { data: preferences },
    entitlement,
    completeness,
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name,target_roles,account_status').eq('user_id', user.id).single(),
    supabaseAdmin.from('career_profiles').select('headline,skills').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('job_preferences').select('remote_types,locations').eq('user_id', user.id).maybeSingle(),
    getEntitlement(user.id),
    getProfileCompleteness(user.id),
  ]);

  const boardLinks = buildBoardLinks({
    targetRoles: profile?.target_roles ?? [],
    locations: preferences?.locations ?? [],
    remoteOnly: isRemoteOnly(preferences?.remote_types),
  });

  const [
    { count: applicationCount },
    { count: inFlightCount },
    { count: interviewCount },
    { count: draftCount },
    { data: drafts },
  ] = await Promise.all([
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['SUBMITTED', 'INTERVIEW']),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'INTERVIEW'),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'DRAFT'),
    supabaseAdmin.from('applications').select('id,created_at,jobs(company,title,url)').eq('user_id', user.id).eq('status', 'DRAFT').order('created_at', { ascending: false }).limit(4),
  ]);

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

  // Plan-aware quota line: FREE counts lifetime documents, paid plans daily.
  const quotaLine =
    entitlement.plan === 'FREE'
      ? `${entitlement.ai_credits_remaining} of 3 free documents left`
      : `${entitlement.ai_credits_remaining} AI generations today`;

  // Deterministic, real-derived next steps (no fabricated suggestions).
  const suggestions: { text: string; href: string }[] = [];
  if (completeness.percent < 100) suggestions.push({ text: `Finish your profile, ${completeness.percent}% complete for stronger matches.`, href: '/profile' });
  if ((applicationCount ?? 0) === 0) suggestions.push({ text: 'Track your first application to start your history.', href: '/applications' });
  if (entitlement.automation_enabled) suggestions.push({ text: 'Agent mode is on for your plan; bring a job link to begin.', href: '/applications' });
  if (suggestions.length === 0) suggestions.push({ text: 'Refresh your CV and run an ATS check for your next role.', href: '/generate' });

  return (
    <AppShell active="dashboard" title="Dashboard">
      <div className="dd-banner" role="note">
        Your application is free. Jobiest never asks candidates for money, and nothing is ever sent
        without your approval.
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
      <DashboardSetup needsSetup={!profile?.target_roles?.length} />

      <section className="dd-stats" aria-label="Your numbers">
        <div className="dd-stat"><b>{applicationCount ?? 0}</b><span>Applications</span></div>
        <div className="dd-stat"><b>{interviews}</b><span>Interviews</span></div>
        <div className="dd-stat"><b>{responseRate}%</b><span>Response rate</span></div>
        <div className="dd-stat"><b>{completeness.percent}%</b><span>Profile strength</span></div>
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
