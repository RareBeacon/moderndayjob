import { AppShell } from '@/components/site/AppShell';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { PLANS } from '@/lib/billing/pricing';
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

// Safe fallback UI that never throws — used when anything in the dashboard data path fails.
// Shows real message so support can diagnose without relying on redacted production digests.
function DashboardFallback({ message, stack }: { message: string; stack?: string }) {
  const safeMsg = String(message || 'Unknown error').slice(0, 800);
  const safeStack = String(stack || '').slice(0, 800);
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, color: '#0f172a', margin: '0 0 8px' }}>Your dashboard is being prepared</h1>
      <p style={{ color: '#6b7280', lineHeight: 1.6, margin: '0 0 16px' }}>
        We had trouble loading some dashboard data. Your account and data are safe. This usually resolves on retry.
      </p>
      <pre
        style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 12,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: '#374151',
          margin: 0,
        }}
      >
        {safeMsg}
        {safeStack ? `\n\n${safeStack}` : ''}
      </pre>
      <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <a
          href="/dashboard"
          style={{
            background: '#d7f94b',
            color: '#111d35',
            padding: '10px 18px',
            borderRadius: 999,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Try again
        </a>
        <a
          href="/profile"
          style={{
            border: '1px solid #e5e7eb',
            padding: '10px 18px',
            borderRadius: 999,
            textDecoration: 'none',
            color: '#374151',
          }}
        >
          Complete profile
        </a>
      </div>
    </div>
  );
}

/**
 * Dashboard, the one clear home for a signed-in user. A greeting, one primary
 * action (Start an application), honest counts from the database, drafts
 * awaiting approval, and the next step; nothing else. Users bring the jobs
 * they want; this page never dumps a listings pool.
 */
export default async function Dashboard() {
  // Everything inside one try so no failure reaches the error boundary as a redacted digest.
  // requireUserOrRedirect triages auth outcomes to redirects; anything else is caught here.
  try {
    const user = await requireUserOrRedirect('/dashboard');
    return await DashboardBody(user);
  } catch (error) {
    // Next.js redirect() throws a special NEXT_REDIRECT error — must rethrow it
    const msg = String((error as any)?.message ?? error);
    if (msg === 'NEXT_REDIRECT' || (error as any)?.digest?.startsWith?.('NEXT_REDIRECT')) {
      throw error;
    }
    const displayMsg = msg.slice(0, 800);
    console.error('[dashboard] render failed', {
      message: displayMsg,
      digest: (error as any)?.digest,
      stack: String((error as Error)?.stack ?? '').slice(0, 600),
    });
    // Best-effort audit — never let logging break the fallback
    try {
      void auditEvent({
        action: 'SERVER_RENDER_ERROR',
        resource: 'dashboard',
        outcome: 'error',
        meta: {
          message: displayMsg.slice(0, 400),
          digest: String((error as any)?.digest ?? '').slice(0, 80),
          stack: String((error as Error)?.stack ?? '').slice(0, 800),
        },
      });
    } catch {}
    return <DashboardFallback message={displayMsg} stack={String((error as Error)?.stack ?? '')} />;
  }
}

async function DashboardBody(user: Awaited<ReturnType<typeof requireUserOrRedirect>>): Promise<import('react').ReactNode> {
  // Wrap entire body in try so second-batch failures also hit the fallback with real message
  try {
    return await DashboardBodyInner(user);
  } catch (error) {
    const msg = String((error as Error)?.message ?? error).slice(0, 800);
    console.error('[dashboard:body] failed', { userId: user.id.slice(0, 8), message: msg, stack: String((error as Error)?.stack ?? '').slice(0, 500) });
    try {
      void auditEvent({
        action: 'SERVER_RENDER_ERROR',
        resource: 'dashboard:body',
        outcome: 'error',
        meta: { message: msg.slice(0, 400), userId: user.id, stack: String((error as Error)?.stack ?? '').slice(0, 800) },
      });
    } catch {}
    return <DashboardFallback message={msg} stack={String((error as Error)?.stack ?? '')} />;
  }
}

async function DashboardBodyInner(user: Awaited<ReturnType<typeof requireUserOrRedirect>>): Promise<import('react').ReactNode> {
  // First batch: already has catches on entitlement/completeness; profiles guarded via maybeSingle
  const [
    { data: profile },
    { data: career },
    { data: preferences },
    entitlement,
    completeness,
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name,target_roles,account_status').eq('user_id', user.id).maybeSingle().then(
      (r) => r,
      () => ({ data: null, error: { message: 'profiles_fallback' } }) as any,
    ),
    supabaseAdmin.from('career_profiles').select('headline,skills').eq('user_id', user.id).maybeSingle().then(
      (r) => r,
      () => ({ data: null, error: null }) as any,
    ),
    supabaseAdmin.from('job_preferences').select('remote_types,locations,application_mode').eq('user_id', user.id).maybeSingle().then(
      (r) => r,
      () => ({ data: null, error: null }) as any,
    ),
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

  const profileSafe = (profile as any) ?? { full_name: null, target_roles: null, account_status: 'ACTIVE' };
  let setupRequired = false;
  try {
    setupRequired = isGatedCohort(user.created_at) && (completeness as any)?.percent < ONBOARDING_THRESHOLD;
  } catch {}

  let boardLinks: ReturnType<typeof buildBoardLinks> = [];
  try {
    boardLinks = buildBoardLinks({
      targetRoles: (profileSafe as any)?.target_roles ?? [],
      locations: (preferences as any)?.locations ?? [],
      remoteOnly: isRemoteOnly((preferences as any)?.remote_types),
    });
  } catch {
    boardLinks = [];
  }

  const autoMode = (preferences as any)?.application_mode === 'auto';

  // Second batch: EVERY query individually guarded so one table/RPC failure cannot crash dashboard
  const safeCount = (p: Promise<any>): Promise<{ count: number | null }> =>
    p.then(
      (r) => ({ count: r?.count ?? null }),
      () => ({ count: null }),
    );
  const safeData = (p: Promise<any>): Promise<{ data: any }> =>
    p.then(
      (r) => ({ data: r?.data ?? null }),
      () => ({ data: null }),
    );

  const [
    { count: applicationCount },
    { count: inFlightCount },
    { count: interviewCount },
    { count: draftCount },
    { data: drafts },
    { data: pipelineCounts },
    docCredits,
    appCredits,
    { data: activation },
    { count: portfolioCount },
  ] = await Promise.all([
    safeCount(supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id)),
    safeCount(supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['SUBMITTED', 'INTERVIEW'])),
    safeCount(supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'INTERVIEW')),
    safeCount(supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'DRAFT')),
    safeData(supabaseAdmin.from('applications').select('id,created_at,jobs(company,title,url)').eq('user_id', user.id).eq('status', 'DRAFT').order('created_at', { ascending: false }).limit(4)),
    safeData(supabaseAdmin.from('applications').select('status').eq('user_id', user.id).limit(500)),
    creditAvailable(user.id, 'DOCUMENT').catch(() => null),
    creditAvailable(user.id, 'AUTO_APPLY').catch(() => null),
    safeData(supabaseAdmin.from('auto_apply_activations').select('status, card_last4, bank').eq('user_id', user.id).maybeSingle()),
    safeCount(supabaseAdmin.from('portfolios').select('*', { count: 'exact', head: true }).eq('user_id', user.id)),
  ]);

  const statusTally = new Map<string, number>();
  try {
    for (const row of (pipelineCounts as any[]) ?? []) {
      if (row?.status) statusTally.set(row.status, (statusTally.get(row.status) ?? 0) + 1);
    }
  } catch {}
  const tally = (...statuses: string[]) => statuses.reduce((sum, s) => sum + (statusTally.get(s) ?? 0), 0);
  const preparedCount = tally('DRAFT', 'PREPARING', 'AWAITING_APPROVAL', 'APPROVED', 'QUEUED', 'AWAITING_USER_INPUT');
  const sentCount = statusTally.get('SUBMITTED') ?? 0;
  const checkingCount = statusTally.get('AWAITING_VERIFICATION') ?? 0;

  const draftApps = ((drafts as any) ?? []) as DraftApp[];
  const inFlight = inFlightCount ?? 0;
  const interviews = interviewCount ?? 0;
  const responseRate = inFlight > 0 ? Math.round((interviews / inFlight) * 100) : 0;

  let firstName = 'there';
  try {
    const raw = (profileSafe as any)?.full_name || (user as any)?.email?.split('@')[0] || 'there';
    firstName = String(raw).split(' ')[0] || 'there';
  } catch {}
  let greeting = 'Good morning';
  try {
    const lagosHour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date()),
    );
    greeting = greetingForHour(Number.isFinite(lagosHour) ? lagosHour : 12);
  } catch {}

  // Quota line: guard against missing entitlement fields
  let quotaLine = 'Your documents and applications';
  try {
    quotaLine =
      docCredits !== null
        ? `${docCredits} document credit${docCredits === 1 ? '' : 's'} left this month`
        : (entitlement as any)?.plan === 'FREE'
          ? `${(entitlement as any)?.ai_credits_remaining ?? 0} of 3 free documents left`
          : `${(entitlement as any)?.ai_credits_remaining ?? 0} AI generations today`;
  } catch {}
  const activationActive = (activation as { status?: string } | null)?.status === 'ACTIVE';

  const suggestions: { text: string; href: string }[] = [];
  try {
    if ((completeness as any)?.percent < 100) suggestions.push({ text: `Finish your profile, ${(completeness as any).percent}% complete for stronger matches.`, href: '/profile' });
    if ((applicationCount ?? 0) === 0) suggestions.push({ text: 'Track your first application to start your history.', href: '/applications' });
    if (autoMode) suggestions.push({ text: 'Automatic submission is on; your agent applies within your rules.', href: '/applications' });
    else if ((entitlement as any)?.automation_enabled) suggestions.push({ text: 'Agent mode is on for your plan; bring a job link to begin.', href: '/applications' });
    if (!(entitlement as any)?.automation_enabled && !activationActive) {
      suggestions.push({ text: 'Unlock 5 free auto-applies a month: verify a card once (the check costs nothing).', href: '/auto-apply/activation' });
    }
    if ((portfolioCount ?? 0) === 0) suggestions.push({ text: 'Create your portfolio page and share one link with recruiters.', href: '/portfolios' });
    if (suggestions.length === 0) suggestions.push({ text: 'Refresh your CV and run an ATS check for your next role.', href: '/generate' });
  } catch {
    if (suggestions.length === 0) suggestions.push({ text: 'Refresh your CV and run an ATS check for your next role.', href: '/generate' });
  }

  // Allowance meters: guard PLANS lookup
  let docLeft = 0;
  let docMax = 3;
  let autoLeft = 0;
  let autoMax = 0;
  let autoLocked = true;
  try {
    const planCode = ((entitlement as any)?.plan as keyof typeof PLANS) ?? 'FREE';
    const planDef = (PLANS as any)[planCode];
    docLeft = docCredits !== null ? docCredits : ((entitlement as any)?.ai_credits_remaining ?? 0);
    docMax = planCode === 'FREE' ? ((PLANS.FREE.lifetimeDocs ?? 3) as number) : ((planDef?.documentCredits ?? 3) as number);
    autoLeft = (appCredits as number) ?? 0;
    autoMax = (planDef?.automationSlots ?? 0) as number;
    autoLocked = !(entitlement as any)?.automation_enabled && !activationActive;
  } catch {}

  return (
    <AppShell active="dashboard" title="Dashboard">
      <DashboardView
        greeting={greeting}
        firstName={firstName}
        autoMode={autoMode}
        planLabel={(entitlement as any)?.plan ?? 'FREE'}
        quotaLine={quotaLine}
        profilePercent={(completeness as any)?.percent ?? 0}
        stats={{ applications: applicationCount ?? 0, interviews, responseRate }}
        pipeline={{ prepared: preparedCount, checking: checkingCount, sent: sentCount, interviews }}
        drafts={draftApps.map((a) => ({
          id: a.id,
          role: (a as any)?.jobs?.title || 'Untitled role',
          company: (a as any)?.jobs?.company || 'Unknown company',
        }))}
        allowances={{
          documents: { left: docLeft, max: docMax, note: quotaLine },
          autoApply: {
            left: autoLeft,
            max: Math.max(autoMax, autoLeft),
            locked: autoLocked,
            note: `Auto-apply credits: ${autoLeft} left this month${autoLocked ? ' \u00b7 unlock 5 free with a card check' : ''}`,
          },
          extraNote:
            (portfolioCount ?? 0) > 0
              ? `${portfolioCount} portfolio${portfolioCount === 1 ? '' : 's'} \u00b7 view them from the Portfolios tab`
              : undefined,
        }}
        autoSubmit={{
          initialMode: (preferences as any)?.application_mode ?? 'approval',
          planIncludesAutomation: Boolean((entitlement as any)?.automation_enabled),
          sendingLive: process.env.AUTOMATION_SUBMIT_ENABLED === 'true',
        }}
        boardLinks={boardLinks}
        suggestions={suggestions}
        setup={{ needsSetup: !(profileSafe as any)?.target_roles?.length, required: setupRequired }}
        careerHeadline={(career as any)?.headline ?? null}
      />
    </AppShell>
  );
}
