import { supabaseAdmin } from '@/lib/supabase';
import { assertEntitlement } from '@packages/security/entitlements';
import { detectApplyAdapter } from '@/lib/apply/registry';
import {
  decideApprove,
  decidePrepare,
  decideReject,
  decideSubmit,
  decideWithdraw,
  type ApplicationStatus,
  type GateCode,
} from './state-machine';

/**
 * Application approval service (Wave 3). Server-side only; the browser never
 * decides state — every transition is decided by the pure state machine and
 * applied here through the service role.
 *
 * Audit timeline: application events are appended as `agent_tasks` rows with
 * `type='APPLICATION_EVENT'` and `status='COMPLETED'` (the event payload lives
 * in `result` jsonb). They are owner-scoped (reads always filter by user_id)
 * and never touched by the pipeline, which only claims QUEUED/RUNNING tasks.
 * A dedicated `application_events` table is the clean follow-up once Supabase
 * DDL access is available; the timeline reader below is the only place that
 * would change.
 */

/** Pool jobs older than this are treated as expired for NEW applications
 *  (product rule — the pool is re-ingested daily, so a 90-day-old listing is
 *  stale; sources do not currently expose an explicit expiry). */
export const JOB_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

export type AppErrorCode =
  | GateCode
  | 'AUTOMATION_DISABLED'
  | 'NOT_ENTITLED'
  | 'UNSUPPORTED_PLATFORM'
  | 'POLICY_RESTRICTED';

export class AppActionError extends Error {
  code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/* ---------- row shapes ---------- */

interface ApplicationRow {
  id: string;
  user_id: string;
  job_id: string | null;
  email: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  error: string | null;
}

interface JobRow {
  id: string;
  company: string;
  title: string;
  url: string | null;
  location: string | null;
  created_at: string | null;
}

export interface PackageDoc {
  id: string;
  kind: string;
  title: string;
  version: number;
  created_at: string;
  content: string | null;
  truthfulnessPassed: boolean;
}

export interface TimelineEvent {
  event: string;
  at: string;
  meta: Record<string, unknown>;
}

export interface ApplicationDetail {
  application: ApplicationRow & { job: JobRow | null };
  package: PackageDoc[];
  timeline: TimelineEvent[];
  /** Global automatic-submission kill switch (env AUTOMATION_SUBMIT_ENABLED). */
  automationEnabled: boolean;
}

/* ---------- helpers ---------- */

async function fetchApplication(userId: string, id: string): Promise<ApplicationRow | null> {
  const { data } = await supabaseAdmin
    .from('applications')
    .select('id,user_id,job_id,email,status,submitted_at,created_at,error')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as ApplicationRow | null) ?? null;
}

async function fetchJob(jobId: string | null): Promise<JobRow | null> {
  if (!jobId) return null;
  const { data } = await supabaseAdmin
    .from('jobs')
    .select('id,company,title,url,location,created_at')
    .eq('id', jobId)
    .maybeSingle();
  return (data as JobRow | null) ?? null;
}

async function jobExpired(jobId: string | null): Promise<boolean> {
  const job = await fetchJob(jobId);
  if (!job || !job.created_at) return false;
  return Date.now() - new Date(job.created_at).getTime() > JOB_EXPIRY_MS;
}

/** Package present = ≥1 generated document for this application, or an
 *  uploaded CV (documents.kind = MASTER_CV). */
async function hasPackage(userId: string, applicationId: string): Promise<boolean> {
  const { count: gen } = await supabaseAdmin
    .from('generated_documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('application_id', applicationId);
  if ((gen ?? 0) > 0) return true;
  const { count: cv } = await supabaseAdmin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'MASTER_CV');
  return (cv ?? 0) > 0;
}

/** Append an owner-scoped audit event to an application's timeline. Exported
 *  so the Phase 8 worker can write submission events from outside this module. */
export async function appendApplicationEvent(
  userId: string,
  applicationId: string,
  event: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const at = new Date().toISOString();
  await supabaseAdmin.from('agent_tasks').insert({
    user_id: userId,
    application_id: applicationId,
    type: 'APPLICATION_EVENT',
    status: 'COMPLETED',
    payload: { event },
    result: { event, at, by: userId, ...meta },
  });
}

async function writeEvent(app: ApplicationRow, event: string, meta: Record<string, unknown> = {}) {
  await appendApplicationEvent(app.user_id, app.id, event, meta);
}

async function fetchDocs(userId: string, applicationId: string): Promise<PackageDoc[]> {
  const { data } = await supabaseAdmin
    .from('generated_documents')
    .select('id,kind,title,version,created_at,content,source_facts')
    .eq('user_id', userId)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  return ((data ?? []) as Array<{
    id: string;
    kind: string;
    title: string;
    version: number;
    created_at: string;
    content: string | null;
    source_facts: { truthfulnessPassed?: boolean } | null;
  }>).map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    version: d.version,
    created_at: d.created_at,
    content: d.content,
    truthfulnessPassed: d.source_facts?.truthfulnessPassed === true,
  }));
}

async function fetchTimeline(userId: string, applicationId: string): Promise<TimelineEvent[]> {
  const { data } = await supabaseAdmin
    .from('agent_tasks')
    .select('result,created_at')
    .eq('user_id', userId)
    .eq('application_id', applicationId)
    .eq('type', 'APPLICATION_EVENT')
    .order('created_at', { ascending: true });
  return ((data ?? []) as Array<{ result: TimelineEvent | null; created_at: string }>).map((e) => {
    const r: TimelineEvent = (e.result ?? {}) as TimelineEvent;
    return {
      event: r.event ?? 'EVENT',
      at: r.at ?? e.created_at,
      meta: r.meta ?? {},
    };
  });
}

/** Auto-advance PREPARING → AWAITING_APPROVAL once the package is complete. */
async function ensureReady(app: ApplicationRow): Promise<ApplicationRow> {
  if (app.status !== 'PREPARING') return app;
  if (!(await hasPackage(app.user_id, app.id))) return app;
  const { data } = await supabaseAdmin
    .from('applications')
    .update({ status: 'AWAITING_APPROVAL' })
    .eq('id', app.id)
    .eq('user_id', app.user_id)
    .select('id,user_id,job_id,email,status,submitted_at,created_at,error')
    .single();
  if (!data) return app;
  await writeEvent(app, 'PREPARED');
  return data as ApplicationRow;
}

/* ---------- public API ---------- */

export async function getApplication(userId: string, id: string): Promise<ApplicationDetail> {
  const app = await fetchApplication(userId, id);
  if (!app) throw new AppActionError('NOT_FOUND', 'Application not found.');
  const ready = await ensureReady(app);
  const [job, packageDocs, timeline] = await Promise.all([
    fetchJob(ready.job_id),
    fetchDocs(userId, ready.id),
    fetchTimeline(userId, ready.id),
  ]);
  return {
    application: { ...ready, job },
    package: packageDocs,
    timeline,
    automationEnabled: isAutomationEnabled(),
  };
}

export async function listApplications(userId: string): Promise<ApplicationDetail['application'][]> {
  const { data } = await supabaseAdmin
    .from('applications')
    .select('id,user_id,job_id,email,status,submitted_at,created_at,error,jobs(company,title,url,location)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as ApplicationRow & { jobs?: JobRow | JobRow[] | null };
    const job = Array.isArray(r.jobs) ? (r.jobs[0] ?? null) : (r.jobs ?? null);
    return { ...r, job };
  });
}

/** Create (or return the existing) application for a job — idempotent. */
export async function prepareApplication(
  userId: string,
  jobId: string,
  fallbackEmail: string | undefined,
): Promise<ApplicationDetail> {
  const job = await fetchJob(jobId);
  if (!job) throw new AppActionError('NOT_FOUND', 'Job not found.');
  if (await jobExpired(jobId)) throw new AppActionError('EXPIRED_JOB', 'This job listing has expired.');

  // Dedupe: any active application for this job belongs to the user already.
  const { data: existing } = await supabaseAdmin
    .from('applications')
    .select('id')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .in('status', ['DRAFT', 'PREPARING', 'AWAITING_APPROVAL', 'APPROVED', 'SUBMITTED', 'QUEUED'])
    .maybeSingle();
  if (existing) return getApplication(userId, (existing as { id: string }).id);

  // Application email = profile.application_email, else the auth email.
  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('application_email')
    .eq('user_id', userId)
    .maybeSingle();
  const email = (prof?.application_email as string | undefined) || fallbackEmail || '';

  const idem = `assist:${userId}:${jobId}`;
  const insert = await supabaseAdmin
    .from('applications')
    .insert({
      user_id: userId,
      job_id: jobId,
      email,
      status: 'PREPARING',
      idempotency_key: idem,
    })
    .select('id')
    .single();
  if (insert.error) {
    // Race: another request created it first — return that one.
    const { data: raced } = await supabaseAdmin
      .from('applications')
      .select('id')
      .eq('idempotency_key', idem)
      .maybeSingle();
    if (raced) return getApplication(userId, (raced as { id: string }).id);
    throw new AppActionError('DUPLICATE', 'This job is already being prepared.');
  }
  await writeEvent(
    { id: insert.data.id, user_id: userId, job_id: jobId, email, status: 'PREPARING', submitted_at: null, created_at: new Date().toISOString(), error: null },
    'PREPARED',
    { job: `${job.company} — ${job.title}` },
  );
  return getApplication(userId, insert.data.id);
}

export async function approveApplication(userId: string, id: string): Promise<ApplicationDetail> {
  const app = await fetchApplication(userId, id);
  if (!app) throw new AppActionError('NOT_FOUND', 'Application not found.');
  const ready = await ensureReady(app);
  const decision = decideApprove(ready.status as ApplicationStatus, {
    jobExists: true,
    jobExpired: await jobExpired(ready.job_id),
    hasEmail: !!ready.email,
    hasPackage: await hasPackage(userId, ready.id),
  });
  if (decision.code === 'ALREADY_IN_STATE') return getApplication(userId, id);
  if (!decision.ok || !decision.next) throw new AppActionError(decision.code ?? 'INVALID_TRANSITION', messageFor(decision.code));
  await supabaseAdmin.from('applications').update({ status: decision.next }).eq('id', id).eq('user_id', userId);
  await writeEvent(ready, 'APPROVED');
  return getApplication(userId, id);
}

export async function rejectApplication(userId: string, id: string, reason?: string): Promise<ApplicationDetail> {
  const app = await fetchApplication(userId, id);
  if (!app) throw new AppActionError('NOT_FOUND', 'Application not found.');
  const decision = decideReject(app.status as ApplicationStatus);
  if (decision.code === 'ALREADY_IN_STATE') return getApplication(userId, id);
  if (!decision.ok || !decision.next) throw new AppActionError(decision.code ?? 'INVALID_TRANSITION', messageFor(decision.code));
  await supabaseAdmin.from('applications').update({ status: decision.next }).eq('id', id).eq('user_id', userId);
  await writeEvent(app, 'REJECTED', reason ? { reason } : {});
  return getApplication(userId, id);
}

export async function withdrawApplication(userId: string, id: string): Promise<ApplicationDetail> {
  const app = await fetchApplication(userId, id);
  if (!app) throw new AppActionError('NOT_FOUND', 'Application not found.');
  const decision = decideWithdraw(app.status as ApplicationStatus);
  if (decision.code === 'ALREADY_IN_STATE') return getApplication(userId, id);
  if (!decision.ok || !decision.next) throw new AppActionError(decision.code ?? 'INVALID_TRANSITION', messageFor(decision.code));
  await supabaseAdmin.from('applications').update({ status: decision.next }).eq('id', id).eq('user_id', userId);
  await writeEvent(app, 'WITHDRAWN');
  return getApplication(userId, id);
}

export async function submitApplication(userId: string, id: string): Promise<ApplicationDetail> {
  const app = await fetchApplication(userId, id);
  if (!app) throw new AppActionError('NOT_FOUND', 'Application not found.');
  const decision = decideSubmit(app.status as ApplicationStatus);
  if (decision.code === 'ALREADY_IN_STATE') return getApplication(userId, id);
  if (!decision.ok || !decision.next) throw new AppActionError(decision.code ?? 'INVALID_TRANSITION', messageFor(decision.code));
  await supabaseAdmin
    .from('applications')
    .update({ status: decision.next, submitted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  await writeEvent(app, 'SUBMITTED', { method: 'assisted_handoff' });
  return getApplication(userId, id);
}

/** Friendly messages for gate codes shown to the user. */
export function messageFor(code: AppErrorCode | undefined): string {
  switch (code) {
    case 'EXPIRED_JOB':
      return 'This job listing is too old to apply to. Find a newer listing instead.';
    case 'REQUIRED_FIELDS_MISSING':
      return 'Add your application email in Profile and generate a CV or cover letter first.';
    case 'DUPLICATE':
      return 'An application for this job is already being prepared.';
    case 'INVALID_TRANSITION':
      return 'That action is not available for this application right now.';
    case 'NOT_FOUND':
      return 'Application not found.';
    case 'AUTOMATION_DISABLED':
      return 'Automatic submission is not enabled yet.';
    case 'NOT_ENTITLED':
      return 'Your plan does not include automatic submission.';
    case 'UNSUPPORTED_PLATFORM':
      return 'This employer platform is not supported for automatic submission yet.';
    case 'POLICY_RESTRICTED':
      return 'Automatic submission is disabled by policy right now.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** Global automatic-submission kill switch. Absent/false ⇒ nothing can ever
 *  be submitted automatically, regardless of plan or application state. */
export function isAutomationEnabled(): boolean {
  return process.env.AUTOMATION_SUBMIT_ENABLED === 'true';
}

/** Enqueue a controlled automatic submission for an APPROVED application.
 *  Server-side gates only: approved state, kill switch, automation
 *  entitlement, and a supported site adapter. Idempotent. */
export async function requestAutoSubmit(userId: string, id: string): Promise<{ taskId: string }> {
  const app = await fetchApplication(userId, id);
  if (!app) throw new AppActionError('NOT_FOUND', 'Application not found.');
  if (app.status !== 'APPROVED') {
    throw new AppActionError('INVALID_TRANSITION', 'Only applications you have approved can be submitted automatically.');
  }
  if (!isAutomationEnabled()) throw new AppActionError('AUTOMATION_DISABLED', 'Automatic submission is not enabled.');
  try {
    await assertEntitlement(userId, 'automation');
  } catch {
    throw new AppActionError('NOT_ENTITLED', 'Your plan does not include automatic submission.');
  }

  const job = await fetchJob(app.job_id);
  if (!job || !job.url) throw new AppActionError('NOT_FOUND', 'Job not found.');
  if (!detectApplyAdapter(job.url)) {
    throw new AppActionError('UNSUPPORTED_PLATFORM', 'This employer platform is not supported for automatic submission.');
  }

  // Idempotent: reuse an already-queued/running submission task for this app.
  const { data: existing } = await supabaseAdmin
    .from('agent_tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('application_id', id)
    .eq('type', 'APPLICATION')
    .in('status', ['QUEUED', 'RUNNING'])
    .maybeSingle();
  if (existing) return { taskId: (existing as { id: string }).id };

  const { data: task, error } = await supabaseAdmin
    .from('agent_tasks')
    .insert({
      user_id: userId,
      application_id: id,
      type: 'APPLICATION',
      status: 'QUEUED',
      payload: { application_id: id, job_id: app.job_id, mode: 'assisted' },
    })
    .select('id')
    .single();
  if (error) throw new AppActionError('DUPLICATE', 'A submission is already queued for this application.');

  await appendApplicationEvent(userId, id, 'SUBMISSION_REQUESTED', { job: `${job.company} — ${job.title}` });
  return { taskId: (task as { id: string }).id };
}
