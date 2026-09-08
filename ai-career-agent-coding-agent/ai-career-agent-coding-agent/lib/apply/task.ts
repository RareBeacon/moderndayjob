import { supabaseAdmin } from '@/lib/supabase';
import { assertEntitlement } from '@packages/security/entitlements';
import { appendApplicationEvent, JOB_EXPIRY_MS } from '@/lib/applications/service';
import { decideAutoSubmit, messageForGate } from './gate';
import { detectApplyAdapter } from './registry';
import { submitViaBrowser } from './client';
import type { ApplyCandidate } from './types';

/**
 * APPLICATION task processor (Phase 8). Called by lib/agent/pipeline for
 * agent_tasks of type 'APPLICATION'. Re-checks EVERY gate server-side before
 * touching a browser, then delegates to the isolated browser worker. The
 * browser is never trusted: entitlement, application state and the kill
 * switch are all decided here from the database.
 */

export interface ApplicationTaskOutcome {
  status: 'SUCCEEDED' | 'WAITING_APPROVAL';
  result: Record<string, unknown>;
}

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
  company: string | null;
  title: string | null;
  url: string | null;
  created_at: string | null;
}

async function loadApplication(appId: string): Promise<ApplicationRow | null> {
  const { data } = await supabaseAdmin
    .from('applications')
    .select('id,user_id,job_id,email,status,submitted_at,created_at,error')
    .eq('id', appId)
    .maybeSingle();
  return (data as ApplicationRow | null) ?? null;
}

async function loadJob(jobId: string): Promise<JobRow | null> {
  const { data } = await supabaseAdmin
    .from('jobs')
    .select('id,company,title,url,created_at')
    .eq('id', jobId)
    .maybeSingle();
  return (data as JobRow | null) ?? null;
}

async function loadPreferences(userId: string): Promise<{ active: boolean } | null> {
  const { data } = await supabaseAdmin
    .from('job_preferences')
    .select('active')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { active: boolean } | null) ?? null;
}

async function loadProfile(userId: string): Promise<{ full_name: string | null; application_email: string | null } | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('full_name,application_email')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { full_name: string | null; application_email: string | null } | null) ?? null;
}

interface GeneratedDoc {
  kind: string;
  title: string;
  content: string | null;
  truthfulnessPassed: boolean;
}

async function loadPackage(userId: string, applicationId: string): Promise<GeneratedDoc[]> {
  const { data } = await supabaseAdmin
    .from('generated_documents')
    .select('kind,title,content,source_facts')
    .eq('user_id', userId)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  return ((data ?? []) as Array<{
    kind: string;
    title: string;
    content: string | null;
    source_facts: { truthfulnessPassed?: boolean } | null;
  }>).map((d) => ({
    kind: d.kind,
    title: d.title,
    content: d.content,
    truthfulnessPassed: d.source_facts?.truthfulnessPassed === true,
  }));
}

async function masterCvSignedUrl(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('documents')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('kind', 'MASTER_CV')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return null;
  const { data: signed } = await supabaseAdmin.storage.from('career-documents').createSignedUrl(path, 3600);
  return signed?.signedUrl ?? null;
}

function jobExpired(job: JobRow): boolean {
  if (!job.created_at) return false;
  return Date.now() - new Date(job.created_at).getTime() > JOB_EXPIRY_MS;
}

async function isEntitled(userId: string): Promise<boolean> {
  try {
    await assertEntitlement(userId, 'automation');
    return true;
  } catch {
    return false;
  }
}

export async function processApplicationTask(payload: Record<string, unknown>): Promise<ApplicationTaskOutcome> {
  const appId = payload.application_id as string | undefined;
  if (!appId) return { status: 'WAITING_APPROVAL', result: { reason: 'MISSING_APPLICATION_ID' } };

  const app = await loadApplication(appId);
  if (!app) return { status: 'WAITING_APPROVAL', result: { reason: 'APPLICATION_NOT_FOUND' } };
  const userId = app.user_id;

  const job = app.job_id ? await loadJob(app.job_id) : null;
  if (!job) return { status: 'WAITING_APPROVAL', result: { reason: 'JOB_NOT_FOUND' } };

  const [prefs, prof, docs, cvUrl] = await Promise.all([
    loadPreferences(userId),
    loadProfile(userId),
    loadPackage(userId, appId),
    masterCvSignedUrl(userId),
  ]);

  const adapter = detectApplyAdapter(job.url ?? '');
  const decision = decideAutoSubmit({
    automationEnabled: process.env.AUTOMATION_SUBMIT_ENABLED === 'true',
    agentPaused: prefs?.active === false,
    appStatus: app.status,
    entitled: await isEntitled(userId),
    adapterSupported: !!adapter,
    hasEmail: !!(prof?.application_email || app.email),
    hasPackage: docs.length > 0 || !!cvUrl,
    truthfulnessOk: docs.every((d) => d.truthfulnessPassed),
    jobExpired: jobExpired(job),
  });

  if (!decision.ok) {
    return { status: 'WAITING_APPROVAL', result: { reason: decision.code, message: messageForGate(decision.code) } };
  }

  const email = prof?.application_email || app.email;
  const candidate: ApplyCandidate = {
    jobUrl: job.url!,
    company: job.company ?? '',
    title: job.title ?? '',
    email,
    name: prof?.full_name ?? null,
    phone: null,
    cvPath: null,
    cvDownloadUrl: cvUrl,
    coverLetter: docs.find((d) => d.kind === 'COVER_LETTER')?.content ?? null,
    answers: docs
      .filter((d) => d.kind === 'ANSWERS')
      .flatMap((d) => {
        try {
          const parsed = JSON.parse(d.content ?? '{}') as { answers?: { question?: string; answer?: string }[] };
          return (parsed.answers ?? []).map((a) => ({ question: a.question ?? '', answer: a.answer ?? '' }));
        } catch {
          return [];
        }
      }),
  };

  const outcome = await submitViaBrowser({
    jobUrl: candidate.jobUrl,
    allowedDomains: adapter!.domains,
    candidate,
  });

  if (outcome.outcome === 'SUBMITTED') {
    await supabaseAdmin
      .from('applications')
      .update({ status: 'SUBMITTED', submitted_at: new Date().toISOString(), error: null })
      .eq('id', appId)
      .eq('user_id', userId);
    await appendApplicationEvent(userId, appId, 'SUBMITTED', {
      method: 'automated',
      confirmation: outcome.confirmation,
      url: outcome.url,
    });
    return { status: 'SUCCEEDED', result: { outcome: 'SUBMITTED', confirmation: outcome.confirmation } };
  }

  // Stopped safely: record the reason on the application so the user sees it,
  // and mark the task done (no retry storm on a CAPTCHA).
  await supabaseAdmin.from('applications').update({ error: outcome.message }).eq('id', appId).eq('user_id', userId);
  await appendApplicationEvent(userId, appId, 'AUTO_SUBMIT_STOPPED', { code: outcome.code, message: outcome.message });
  return { status: 'SUCCEEDED', result: { outcome: 'STOP', code: outcome.code, message: outcome.message } };
}
