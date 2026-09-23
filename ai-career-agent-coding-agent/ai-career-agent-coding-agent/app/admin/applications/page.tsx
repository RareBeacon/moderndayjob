import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import { applyAdapters, detectApplyAdapter } from '@/lib/apply/registry';

export const dynamic = 'force-dynamic';

/**
 * Admin • Auto-apply pilot scorecard (Milestone 4 instrumentation).
 * Per-adapter success / stop / unconfirmed counts with stop reasons,
 * median task latency, and prepared documents per confirmed submission. This is
 * the permanently-installed instrument the AUTOMATION_SUBMIT_ENABLED
 * decision is read from; no claims on this page are hand-entered, every
 * number is derived from the event ledger (agent_tasks APPLICATION_EVENT
 * rows written by the apply processor itself).
 */

interface EventRow {
  application_id: string | null;
  created_at: string;
  result: { event?: string; method?: string; code?: string } | null;
}

interface TaskRow {
  created_at: string;
  completed_at: string | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export default async function AdminApplicationsPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/applications');

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // 1. Automated-submission events (the processor writes one per outcome).
  const { data: eventRows } = await supabaseAdmin
    .from('agent_tasks')
    .select('application_id, created_at, result')
    .eq('type', 'APPLICATION_EVENT')
    .gte('created_at', since)
    .in('status', ['COMPLETED'])
    .limit(5000);
  const events = (eventRows ?? []) as unknown as EventRow[];
  const autoEvents = events.filter(
    (e) =>
      e.application_id &&
      e.result?.event &&
      ['SUBMITTED', 'AUTO_SUBMIT_STOPPED', 'AUTO_SUBMIT_UNKNOWN'].includes(e.result.event) &&
      // SUBMITTED is also written by the assisted flow; only automated
      // sends count for this scorecard.
      (e.result.event !== 'SUBMITTED' || e.result.method === 'automated'),
  );

  // 2. Resolve application → job URL → adapter.
  const appIds = [...new Set(autoEvents.map((e) => e.application_id!))];
  const jobsByApp = new Map<string, string>();
  if (appIds.length) {
    const { data: apps } = await supabaseAdmin
      .from('applications')
      .select('id, job_id, jobs(url)')
      .in('id', appIds)
      .limit(appIds.length);
    for (const row of (apps ?? []) as Array<{ id: string; jobs?: { url?: string } | Array<{ url?: string }> | null }>) {
      const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
      jobsByApp.set(row.id, job?.url ?? '');
    }
  }

  // 3. Aggregate per adapter.
  type Stat = { attempts: number; submitted: number; stopped: number; unknown: number; reasons: Map<string, number> };
  const stats = new Map<string, Stat>();
  const statFor = (adapter: string): Stat => stats.get(adapter) ?? { attempts: 0, submitted: 0, stopped: 0, unknown: 0, reasons: new Map() };
  for (const e of autoEvents) {
    const url = jobsByApp.get(e.application_id!) ?? '';
    const adapterId = detectApplyAdapter(url)?.id ?? 'unresolved';
    const s = statFor(adapterId);
    s.attempts += 1;
    if (e.result?.event === 'SUBMITTED') s.submitted += 1;
    else if (e.result?.event === 'AUTO_SUBMIT_STOPPED') {
      s.stopped += 1;
      if (e.result.code) s.reasons.set(e.result.code, (s.reasons.get(e.result.code) ?? 0) + 1);
    } else if (e.result?.event === 'AUTO_SUBMIT_UNKNOWN') s.unknown += 1;
    stats.set(adapterId, s);
  }

  // 4. Median end-to-end latency of completed APPLICATION tasks.
  const { data: taskRows } = await supabaseAdmin
    .from('agent_tasks')
    .select('created_at, completed_at')
    .eq('type', 'APPLICATION')
    .eq('status', 'COMPLETED')
    .gte('created_at', since)
    .limit(2000);
  const tasks = (taskRows ?? []) as unknown as TaskRow[];
  const latencies = tasks
    .filter((t) => t.completed_at)
    .map((t) => Math.max(0, new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 1000);
  const latency = median(latencies);

  // 5. Prepared documents per confirmed automated submission.
  const submittedAppIds = autoEvents.filter((e) => e.result?.event === 'SUBMITTED').map((e) => e.application_id!);
  let docsPerSubmit: number | null = null;
  if (submittedAppIds.length) {
    const { count } = await supabaseAdmin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('application_id', submittedAppIds);
    docsPerSubmit = Math.round(((count ?? 0) / submittedAppIds.length) * 10) / 10;
  }

  const totalAttempts = autoEvents.length;
  const totalSubmitted = autoEvents.filter((e) => e.result?.event === 'SUBMITTED').length;
  const totalUnknown = autoEvents.filter((e) => e.result?.event === 'AUTO_SUBMIT_UNKNOWN').length;

  return (
    <AdminShell active="applications">
      <h1 className="ad-h1">Auto-apply scorecard</h1>
      <p className="ad-lede">
        Last 30 days of automated submissions, derived from the event ledger. This is the pilot instrument: read it before changing
        the automation kill switch, adapters, or send policy.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0' }}>
        {[
          { label: 'Automated attempts', value: totalAttempts },
          { label: 'Confirmed submitted', value: totalSubmitted },
          { label: 'Unconfirmed (never auto-retried)', value: totalUnknown },
          {
            label: 'Confirmation rate',
            value: totalAttempts ? `${Math.round((totalSubmitted / totalAttempts) * 100)}%` : 'n/a',
          },
          { label: 'Median task time', value: latency !== null ? `${latency}s` : 'n/a' },
          { label: 'Documents per submission', value: docsPerSubmit !== null ? docsPerSubmit : 'n/a' },
        ].map((c) => (
          <div key={c.label} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{c.value}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {['Adapter', 'Attempts', 'Submitted', 'Stopped', 'Unconfirmed', 'Stop reasons'].map((h) => (
              <th key={h} style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)', padding: '8px 10px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...stats.entries()].map(([adapter, s]) => (
            <tr key={adapter}>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>{adapter}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>{s.attempts}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>{s.submitted}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>{s.stopped}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>{s.unknown}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', color: 'var(--ink-2)' }}>
                {s.reasons.size
                  ? [...s.reasons.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} × ${n}`).join(', ')
                  : 'n/a'}
              </td>
            </tr>
          ))}
          {!stats.size && (
            <tr>
              <td colSpan={6} style={{ padding: '12px 10px', color: 'var(--ink-2)' }}>
                No automated submissions recorded in the window yet. Supported adapters reporting zero attempts is the
                honest baseline, not a gap.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 16 }}>
        Supported adapters today: {applyAdapters.map((a) => a.label).join(', ')}. Every number above is computed from
        agent_tasks events at render time; nothing is cached or hand-entered.
      </p>
    </AdminShell>
  );
}
