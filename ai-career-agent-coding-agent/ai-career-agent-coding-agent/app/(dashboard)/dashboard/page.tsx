import Link from 'next/link';
import ProfileReadiness from '@/components/ProfileReadiness';
import { AppShell } from '@/components/site/AppShell';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getEntitlement } from '@packages/security/entitlements';
import { getProfileCompleteness } from '@/lib/profile-completeness';

type DraftApp = {
  id: string;
  created_at: string;
  jobs: { company: string | null; title: string | null; url: string | null } | null;
};
type FreshJob = { id: string; title: string | null; company: string | null; location: string | null; source: string | null; created_at: string | null };

/**
 * Daily Digest — the "morning paper" dashboard (Broadstreet Journal, v3).
 * Every number on this page is a real count from the database: drafts awaiting
 * approval, applications in flight, listings synced in the last 24h. We never
 * claim scans or "discarded" totals we do not track — the trust banner states
 * what WE guarantee (free to apply, approval-gated), nothing more.
 */
export default async function Dashboard() {
  const user = await requireUser();
  const [
    { data: profile },
    { data: career },
    entitlement,
    completeness,
    { data: prefs },
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name,target_roles,account_status').eq('user_id', user.id).single(),
    supabaseAdmin.from('career_profiles').select('headline,skills').eq('user_id', user.id).maybeSingle(),
    getEntitlement(user.id),
    getProfileCompleteness(user.id),
    supabaseAdmin.from('job_preferences').select('remote_types,locations,application_mode,daily_target').eq('user_id', user.id).maybeSingle(),
  ]);

  if (!profile?.target_roles?.length) redirect('/onboarding');

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    { count: applicationCount },
    { count: submittedCount },
    { count: interviewCount },
    { count: taskCount },
    { count: draftCount },
    { count: newJobsCount },
    { data: drafts },
    { data: freshJobs },
  ] = await Promise.all([
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['SUBMITTED', 'INTERVIEW']),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'INTERVIEW'),
    supabaseAdmin.from('agent_tasks').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['QUEUED', 'RUNNING']),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'DRAFT'),
    supabaseAdmin.from('jobs').select('*', { count: 'exact', head: true }).gt('created_at', since24h),
    supabaseAdmin.from('applications').select('id,created_at,jobs(company,title,url)').eq('user_id', user.id).eq('status', 'DRAFT').order('created_at', { ascending: false }).limit(4),
    supabaseAdmin.from('jobs').select('id,title,company,location,source,created_at').order('created_at', { ascending: false }).limit(4),
  ]);

  const draftApps = (drafts ?? []) as unknown as DraftApp[];
  const jobs = (freshJobs ?? []) as unknown as FreshJob[];
  const draftsWaiting = draftCount ?? 0;
  const inFlight = submittedCount ?? 0;
  const newToday = newJobsCount ?? 0;
  const interviews = interviewCount ?? 0;
  const responseRate = inFlight > 0 ? Math.round((interviews / inFlight) * 100) : 0;

  const prefSummary = [
    prefs?.remote_types?.length ? prefs.remote_types.slice(0, 2).join('/') : null,
    prefs?.locations?.length ? prefs.locations.slice(0, 2).join(', ') : null,
    prefs?.application_mode ? `${prefs.application_mode} mode` : null,
    prefs?.daily_target ? `${prefs.daily_target}/day` : null,
  ].filter(Boolean).join(' · ');

  const firstName = (profile.full_name || 'there').split(' ')[0];
  const dateLine = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos',
  });

  // Honest digest sentence — only real counts, never scan totals we don't track.
  const parts: string[] = [];
  if (draftsWaiting > 0) parts.push(`${draftsWaiting} draft${draftsWaiting === 1 ? '' : 's'} waiting for your approval`);
  if (inFlight > 0) parts.push(`${inFlight} application${inFlight === 1 ? '' : 's'} in flight`);
  if (newToday > 0) parts.push(`${newToday} listing${newToday === 1 ? '' : 's'} synced to your pool since yesterday`);
  const summary = parts.length
    ? `${parts.join(', ')}. Nothing is sent until you approve it.`
    : 'A quiet day — your pool is ready when you are. Nothing is ever sent without your approval.';

  // Deterministic, real-derived next steps (no fabricated suggestions)
  const suggestions: { text: string; href: string }[] = [];
  if (completeness.percent < 100) suggestions.push({ text: `Finish your profile — ${completeness.percent}% complete for stronger matches.`, href: '/onboarding' });
  if ((applicationCount ?? 0) === 0) suggestions.push({ text: 'Track your first application to start your history.', href: '/applications' });
  if (entitlement.automation_enabled && (taskCount ?? 0) === 0) suggestions.push({ text: 'Your agent is ready. Find matches to begin automation.', href: '/match' });
  suggestions.push({ text: 'Refresh your CV and run an ATS check for your next role.', href: '/generate' });

  return (
    <AppShell active="dashboard" title="Daily digest">
      {/* Trust banner — statements about us, provably true */}
      <div className="dd-banner" role="note">
        Your application is free. Jobiest never asks candidates for money, and nothing is ever sent
        without your approval.
      </div>

      <header className="dd-head">
        <span className="dd-over">Daily digest</span>
        <h1>{dateLine}</h1>
        <p>{summary}</p>
        <span className="dd-meta">Plan · {entitlement.plan} · {entitlement.ai_credits_remaining} AI credits today</span>
      </header>
      <div className="dd-rule" aria-hidden="true" />

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
              <p className="muted dd-note">Drafts are prepared from your verified facts only. Approve, edit, or reject — your call, every time.</p>
            </section>
          )}

          <section className="dd-sec" aria-label="New in your pool">
            <span className="dd-over">New in your pool</span>
            {jobs.length === 0 ? (
              <div className="dd-empty">
                <p className="muted">No listings synced yet.</p>
                <Link className="inline-link" href="/jobs">Browse jobs →</Link>
              </div>
            ) : (
              <>
                <div className="dd-articles">
                  {jobs.map((j) => (
                    <article className="dd-article" key={j.id}>
                      <span className="dd-art-over">
                        {(j.source || 'Synced').toLowerCase()} · {j.created_at ? j.created_at.slice(0, 10) : 'recent'}
                      </span>
                      <h2>{j.title || 'Untitled role'}</h2>
                      <p className="dd-art-meta">
                        {j.company || 'Unknown company'}{j.location ? ` · ${j.location}` : ''}
                      </p>
                    </article>
                  ))}
                </div>
                <p className="muted dd-note">
                  Latest listings, as synced.{' '}
                  <Link href="/match" className="inline-link">Run matching →</Link> to see which ones actually fit.
                </p>
              </>
            )}
          </section>
        </div>

        <aside className="dd-side">
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

          {prefSummary && (
            <p className="muted dd-note" style={{ marginTop: 18 }}>{prefSummary}</p>
          )}
          {career?.headline && <p className="muted dd-note">{career.headline}</p>}
        </aside>
      </div>
    </AppShell>
  );
}
