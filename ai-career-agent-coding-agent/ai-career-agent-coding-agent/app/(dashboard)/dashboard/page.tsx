import Link from 'next/link';
import ProfileReadiness from '@/components/ProfileReadiness';
import { AppShell } from '@/components/site/AppShell';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getEntitlement } from '@packages/security/entitlements';
import { getProfileCompleteness } from '@/lib/profile-completeness';

function stepHref(label: string) {
  return label.toLowerCase().includes('cv') ? '/documents' : '/profile';
}

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

  const [{ count: applicationCount }, { count: taskCount }] = await Promise.all([
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabaseAdmin.from('agent_tasks').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['QUEUED', 'RUNNING']),
  ]);

  const prefSummary = [
    prefs?.remote_types?.length ? prefs.remote_types.slice(0, 2).join('/') : null,
    prefs?.locations?.length ? prefs.locations.slice(0, 2).join(', ') : null,
    prefs?.application_mode ? `${prefs.application_mode} mode` : null,
    prefs?.daily_target ? `${prefs.daily_target}/day` : null,
  ].filter(Boolean).join(' · ');

  const firstName = (profile.full_name || 'there').split(' ')[0];

  return (
    <AppShell active="dashboard" title={`Welcome back, ${firstName}`}>
      <section className="workspace-hero">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Good to see you, {firstName}.</h1>
        <p>{career?.headline || 'Your private career workspace is ready. Build your profile, choose your tools, and move at your own pace.'}</p>
      </section>

      <section className="completeness">
        <p className="eyebrow">PROFILE READINESS</p>
        <ProfileReadiness />
      </section>

      {completeness.percent < 100 ? (
        <section className="card next-steps">
          <div className="section-title">
            <h2>{completeness.percent}% ready — a few quick wins</h2>
            <Link href="/onboarding" className="inline-link">Open wizard →</Link>
          </div>
          <p className="muted">A complete profile means stronger matches and truthful applications. Finish these to get the most out of your agent:</p>
          <ul className="step-list">
            {completeness.next.slice(0, 5).map((s) => (
              <li key={s}>
                <span className="dot-mini" aria-hidden="true" />
                <Link href={stepHref(s)} className="inline-link">{s}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="metrics">
        <article><p>Plan</p><strong>{entitlement.plan}</strong><span>{entitlement.automation_enabled ? 'Automation available' : 'Automation locked'}</span></article>
        <article><p>AI credits today</p><strong>{entitlement.ai_credits_remaining}</strong><span>Available now</span></article>
        <article><p>Applications</p><strong>{applicationCount || 0}</strong><span>Real records only</span></article>
        <article><p>Agent tasks</p><strong>{taskCount || 0}</strong><span>Queued or running</span></article>
      </section>

      <section className="workspace-grid">
        <article className="card">
          <p className="eyebrow">YOUR DIRECTION</p>
          <h2>{profile.target_roles.join(' · ')}</h2>
          <p className="muted">{career?.skills?.length ? `${career.skills.length} skills in your verified profile.` : 'Add skills and experience to improve future recommendations.'}</p>
          {prefSummary ? <p className="muted pref-line">{prefSummary}</p> : null}
          <div className="dashboard-links">
            <Link href="/onboarding" className="inline-link">Update profile →</Link>
            <Link href="/documents" className="inline-link">Upload CV →</Link>
          </div>
        </article>
        <article className="card">
          <p className="eyebrow">NEXT STEP</p>
          <h2>Build your career foundation.</h2>
          <p className="muted">CV upload, free AI career tools, and job matching are connected to this workspace. Nothing is submitted automatically.</p>
          <div className="dashboard-links">
            <Link href="/jobs" className="inline-link">Browse jobs →</Link>
            <Link href="/match" className="inline-link">Find matches →</Link>
            <Link href="/generate" className="inline-link">Generate documents →</Link>
            <Link href="/applications" className="inline-link">Track applications →</Link>
            <Link href="/billing" className="inline-link">View plans and limits →</Link>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
