import Link from 'next/link';
import ProfileReadiness from '@/components/ProfileReadiness';
import { AppShell } from '@/components/site/AppShell';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getEntitlement } from '@packages/security/entitlements';
import { getProfileCompleteness } from '@/lib/profile-completeness';

type RecentApp = {
  id: string;
  status: string;
  created_at: string;
  jobs: { company: string | null; title: string | null; url: string | null; location: string | null } | null;
};
type FreshJob = { id: string; title: string | null; company: string | null; location: string | null };

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

  const [{ count: applicationCount }, { count: submittedCount }, { count: interviewCount }, { count: taskCount }, { data: recentApps }, { data: freshJobs }] = await Promise.all([
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['SUBMITTED', 'INTERVIEW']),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'INTERVIEW'),
    supabaseAdmin.from('agent_tasks').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['QUEUED', 'RUNNING']),
    supabaseAdmin.from('applications').select('id,status,created_at,jobs(company,title,url,location)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('jobs').select('id,title,company,location').order('created_at', { ascending: false }).limit(3),
  ]);

  const apps = (recentApps ?? []) as unknown as RecentApp[];
  const jobs = (freshJobs ?? []) as unknown as FreshJob[];
  const interviews = interviewCount ?? 0;
  const submitted = submittedCount ?? 0;
  const responseRate = submitted > 0 ? Math.round((interviews / submitted) * 100) : 0;

  const prefSummary = [
    prefs?.remote_types?.length ? prefs.remote_types.slice(0, 2).join('/') : null,
    prefs?.locations?.length ? prefs.locations.slice(0, 2).join(', ') : null,
    prefs?.application_mode ? `${prefs.application_mode} mode` : null,
    prefs?.daily_target ? `${prefs.daily_target}/day` : null,
  ].filter(Boolean).join(' · ');

  const firstName = (profile.full_name || 'there').split(' ')[0];

  // Deterministic, real-derived next steps (no fabricated suggestions)
  const suggestions: { text: string; href: string }[] = [];
  if (completeness.percent < 100) suggestions.push({ text: `Finish your profile — ${completeness.percent}% complete for stronger matches.`, href: '/onboarding' });
  if ((applicationCount ?? 0) === 0) suggestions.push({ text: 'Track your first application to start your history.', href: '/applications' });
  if (entitlement.automation_enabled && (taskCount ?? 0) === 0) suggestions.push({ text: 'Your agent is ready. Find matches to begin automation.', href: '/match' });
  suggestions.push({ text: 'Refresh your CV and run an ATS check for your next role.', href: '/generate' });

  return (
    <AppShell active="dashboard" title={`Welcome back, ${firstName}`}>
      <section className="workspace-hero">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Good to see you, {firstName}.</h1>
        <p>{career?.headline || 'Your private career workspace is ready. Build your profile, choose your tools, and move at your own pace.'}</p>
        <span className="dm-plan">Plan · {entitlement.plan} · {entitlement.ai_credits_remaining} credits today</span>
      </section>

      {/* Career momentum — one connected composition, not four identical cards */}
      <section className="dm">
        <div className="dm-head">
          <div>
            <p className="eyebrow">CAREER MOMENTUM</p>
            <h2>Your momentum, at a glance.</h2>
          </div>
        </div>
        <div className="dm-track">
          <svg className="dm-line" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="10,78 120,60 230,40 340,16 390,8" fill="none" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {[[120, 60], [230, 40], [340, 16]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4.5" fill="var(--brand)" />
            ))}
          </svg>
          <div className="dm-stats">
            <div className="dm-stat"><b>{applicationCount ?? 0}</b><span>Applications</span></div>
            <div className="dm-stat"><b>{interviews}</b><span>Interviews</span></div>
            <div className="dm-stat"><b>{responseRate}%</b><span>Response rate</span></div>
            <div className="dm-stat"><b>{completeness.percent}%</b><span>Profile strength</span></div>
          </div>
        </div>
      </section>

      <section className="completeness">
        <p className="eyebrow">PROFILE READINESS</p>
        <ProfileReadiness />
      </section>

      {/* Two-column: recent applications + next steps */}
      <section className="dash-cols">
        <article className="card dash-col">
          <div className="section-title">
            <h2>Recent applications</h2>
            <Link href="/applications" className="inline-link">View all →</Link>
          </div>
          {apps.length === 0 ? (
            <div className="dash-empty">
              <p className="muted">No applications tracked yet.</p>
              <Link className="inline-link" href="/applications">Track your first →</Link>
            </div>
          ) : (
            <ul className="dash-feed">
              {apps.map((a) => (
                <li key={a.id}>
                  <span className={`dot-mini ${a.status}`} aria-hidden="true" />
                  <div className="dash-feed-main">
                    <b>{a.jobs?.title || 'Untitled role'}</b>
                    <span>{a.jobs?.company || 'Unknown company'}</span>
                  </div>
                  <span className="dash-feed-status">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card dash-col">
          <div className="section-title"><h2>Next steps</h2></div>
          <ul className="dash-suggest">
            {suggestions.map((s, i) => (
              <li key={i}>
                <span className="dot-mini" aria-hidden="true" />
                <Link href={s.href} className="inline-link">{s.text}</Link>
              </li>
            ))}
          </ul>
        </article>
      </section>

      {/* Fresh opportunities (real, not "recommended" unless matched) */}
      <section className="card">
        <div className="section-title">
          <h2>Fresh opportunities</h2>
          <Link href="/match" className="inline-link">Find your matches →</Link>
        </div>
        {jobs.length === 0 ? (
          <div className="dash-empty">
            <p className="muted">No opportunities synced yet.</p>
            <Link className="inline-link" href="/jobs">Browse jobs →</Link>
          </div>
        ) : (
          <div className="dash-jobs">
            {jobs.map((j) => (
              <Link className="dash-job" key={j.id} href="/jobs">
                <span className="dash-job-co">{(j.company || '?').slice(0, 1)}</span>
                <span className="dash-job-main">
                  <b>{j.title || 'Untitled role'}</b>
                  <span>{j.company || 'Unknown'}{j.location ? ` · ${j.location}` : ''}</span>
                </span>
                <span className="dash-job-arrow">→</span>
              </Link>
            ))}
          </div>
        )}
        {prefSummary ? <p className="muted pref-line" style={{ marginTop: 16 }}>{prefSummary}</p> : null}
      </section>
    </AppShell>
  );
}
