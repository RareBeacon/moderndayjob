/**
 * Approval snapshot + window (Master Implementation Package B-181, §148-151,
 * DoD 6). An approval is bound to the EXACT package it approved:
 *
 *   1. On approve: hash every package document + the application email and
 *      store it with approved_at.
 *   2. Before ANY submission (assisted handoff OR auto-submit), recompute and
 *      compare. Mismatch (package edited, docs regenerated, email changed)
 *      or a >24h-old approval reverts the application to AWAITING_APPROVAL.
 *      Nothing is ever submitted against a stale approval.
 *
 * The snapshot is written once at approval; regenerating a document after
 * approval changes the hash and therefore invalidates the approval.
 */
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';

/** How long an approval stays valid. */
export const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ApprovalSnapshot {
  v: 1;
  hash: string;
  approvedAt: string;
  email: string;
  docs: Array<{ source: string; kind: string; title: string; digest: string }>;
}

export type VerificationFailure = 'APPROVAL_MISSING' | 'APPROVAL_STALE' | 'APPROVAL_EXPIRED';

export type Verification =
  | { ok: true; snapshot: ApprovalSnapshot }
  | { ok: false; code: VerificationFailure };

interface ApplicationRow {
  id: string;
  email: string;
  status: string;
  approved_at: string | null;
  approval_snapshot: ApprovalSnapshot | null;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Canonical digest of one document row. */
function digestDoc(source: string, kind: string, title: string, content: string | null | undefined): string {
  return sha256(`${source}¦${kind}¦${title}¦${(content ?? '').length}¦${sha256(content ?? '')}`);
}

/** Load + hash the CURRENT package for an application. */
export async function computeApprovalSnapshot(userId: string, applicationId: string): Promise<ApprovalSnapshot> {
  const [genRes, cvRes, appRes] = await Promise.all([
    supabaseAdmin
      .from('generated_documents')
      .select('kind,title,content')
      .eq('user_id', userId)
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('documents')
      .select('id,kind,created_at')
      .eq('user_id', userId)
      .eq('kind', 'MASTER_CV')
      .order('created_at', { ascending: false })
      .limit(1),
    supabaseAdmin
      .from('applications')
      .select('id,email')
      .eq('id', applicationId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const docs: ApprovalSnapshot['docs'] = [
    ...((genRes.data ?? []) as Array<{ kind: string; title: string; content: string | null }>).map((d) => ({
      source: 'generated_documents',
      kind: d.kind,
      title: d.title,
      digest: digestDoc('generated_documents', d.kind, d.title, d.content),
    })),
    ...((cvRes.data ?? []) as Array<{ id: string; kind: string; created_at: string }>).map((d) => ({
      source: 'documents',
      kind: 'MASTER_CV',
      title: d.id,
      digest: digestDoc('documents', 'MASTER_CV', d.id, d.created_at),
    })),
  ];

  const email = ((appRes.data as { email?: string } | null)?.email ?? '').trim();
  const hash = sha256(
    JSON.stringify({ v: 1, email, docs: docs.map((d) => `${d.source}:${d.kind}:${d.digest}`) }),
  );
  return { v: 1, hash, approvedAt: new Date().toISOString(), email, docs };
}

/** Load the stored snapshot + approval time. */
export async function loadApprovalState(
  userId: string,
  applicationId: string,
): Promise<ApplicationRow | null> {
  const { data } = await supabaseAdmin
    .from('applications')
    .select('id,email,status,approved_at,approval_snapshot')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as ApplicationRow | null) ?? null;
}

/**
 * Verify the stored approval against the CURRENT package (B-181). Pure check;
 * the caller decides to revert. Exported verifyApproval reverts too (below).
 */
export async function verifyApprovalSnapshot(
  userId: string,
  applicationId: string,
  now: Date = new Date(),
): Promise<Verification> {
  const row = await loadApprovalState(userId, applicationId);
  if (!row || row.status !== 'APPROVED') return { ok: false, code: 'APPROVAL_MISSING' };
  const snap = row.approval_snapshot;
  if (!snap || !row.approved_at) return { ok: false, code: 'APPROVAL_MISSING' };
  if (now.getTime() - new Date(row.approved_at).getTime() > APPROVAL_WINDOW_MS) {
    return { ok: false, code: 'APPROVAL_EXPIRED' };
  }
  const current = await computeApprovalSnapshot(userId, applicationId);
  if (current.hash !== snap.hash) return { ok: false, code: 'APPROVAL_STALE' };
  return { ok: true, snapshot: snap };
}

/**
 * Verify and, on failure, revert the application to AWAITING_APPROVAL with an
 * audit event so the user sees exactly why. Returns the verification.
 */
export async function verifyApprovalAndRevert(
  userId: string,
  applicationId: string,
): Promise<Verification> {
  const verification = await verifyApprovalSnapshot(userId, applicationId);
  if (verification.ok) return verification;
  // NOTE: applications has no updated_at column (only created_at); the
  // revert update must not reference one or it silently fails.
  await supabaseAdmin
    .from('applications')
    .update({ status: 'AWAITING_APPROVAL' })
    .eq('id', applicationId)
    .eq('user_id', userId)
    .eq('status', 'APPROVED');
  const { appendApplicationEvent } = await import('@/lib/applications/service');
  await appendApplicationEvent(userId, applicationId, `APPROVAL_${verification.code === 'APPROVAL_EXPIRED' ? 'EXPIRED' : 'STALE'}`, {
    reason: verification.code,
    message:
      verification.code === 'APPROVAL_EXPIRED'
        ? 'Your approval expired after 24 hours. Review and approve again.'
        : 'Your package changed since you approved it. Review and approve again.',
  });
  return verification;
}
