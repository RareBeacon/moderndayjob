import { supabaseAdmin } from '@/lib/supabase';
import { requireAuditEvent } from '@/lib/audit';
import { notifyUser } from '@/lib/notifications/dispatch';
import type { z } from 'zod';
import {
  adminDecisionSchema,
  adminEmployerDecisionSchema,
  adminReviewFilterSchema,
} from './schemas';
import { TalentPoolError } from './candidate-service';
import type { TalentApplicationStatus } from './constants';

export async function listAdminTalentApplications(
  adminUserId: string,
  filters: z.infer<typeof adminReviewFilterSchema>,
) {
  await requireAuditEvent({
    action: 'ADMIN_TALENT_QUEUE_LISTED',
    resource: 'talent_applications',
    userId: adminUserId,
    outcome: 'allow',
    meta: { page: filters.page, status: filters.status ?? 'ALL' },
  });

  let query = supabaseAdmin
    .from('talent_applications')
    .select(
      'id,user_id,status,career_category,seniority_level,assessment_route,attempt_number,submitted_at,interview_completed_at,review_submitted_at,decided_at,assigned_reviewer_id,latest_score,created_at',
      { count: 'exact' },
    )
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.career_category) query = query.eq('career_category', filters.career_category);
  if (filters.seniority_level) query = query.eq('seniority_level', filters.seniority_level);
  if (filters.assigned_reviewer_id) query = query.eq('assigned_reviewer_id', filters.assigned_reviewer_id);
  if (filters.min_score !== undefined) query = query.gte('latest_score', filters.min_score);
  if (filters.max_score !== undefined) query = query.lte('latest_score', filters.max_score);
  if (filters.submitted_from) query = query.gte('submitted_at', filters.submitted_from);
  if (filters.submitted_to) query = query.lte('submitted_at', `${filters.submitted_to}T23:59:59.999Z`);

  const from = (filters.page - 1) * filters.page_size;
  const to = from + filters.page_size - 1;

  const { data: apps, count, error } = await query.range(from, to);
  if (error) {
    throw new TalentPoolError('ADMIN_QUEUE_LOAD_FAILED', 'Unable to query Talent Pool applications.', 500);
  }

  const rows = (apps ?? []) as Array<{
    id: string;
    user_id: string;
    status: string;
    career_category: string | null;
    seniority_level: string | null;
    assessment_route: string;
    attempt_number: number;
    submitted_at: string | null;
    interview_completed_at: string | null;
    review_submitted_at: string | null;
    decided_at: string | null;
    assigned_reviewer_id: string | null;
    latest_score: number | null;
    created_at: string;
  }>;

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const appIds = rows.map((r) => r.id);

  const [profilesRes, sessionsRes] = await Promise.all([
    userIds.length > 0
      ? supabaseAdmin.from('profiles').select('user_id,full_name,email').in('user_id', userIds)
      : Promise.resolve({ data: [] }),
    appIds.length > 0
      ? supabaseAdmin
          .from('talent_interview_sessions')
          .select('id,application_id,state,mode,created_at')
          .in('application_id', appIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  for (const p of (profilesRes.data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
    profileMap.set(p.user_id, { full_name: p.full_name, email: p.email });
  }

  const sessionMap = new Map<string, { id: string; state: string; mode: string }>();
  for (const s of (sessionsRes.data ?? []) as Array<{ id: string; application_id: string; state: string; mode: string }>) {
    if (!sessionMap.has(s.application_id)) {
      sessionMap.set(s.application_id, { id: s.id, state: s.state, mode: s.mode });
    }
  }

  let items = rows.map((r) => {
    const prof = profileMap.get(r.user_id);
    const sess = sessionMap.get(r.id) ?? null;
    return {
      ...r,
      candidate_name: prof?.full_name ?? 'Unnamed candidate',
      candidate_email: prof?.email ?? null,
      interview_session: sess,
    };
  });

  if (filters.interview_state) {
    items = items.filter((item) => item.interview_session?.state === filters.interview_state);
  }

  return {
    items,
    total: count ?? items.length,
    page: filters.page,
    page_size: filters.page_size,
  };
}

export async function getAdminTalentApplicationDetail(adminUserId: string, applicationId: string) {
  const { data: app } = await supabaseAdmin
    .from('talent_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();

  if (!app) {
    throw new TalentPoolError('APPLICATION_NOT_FOUND', 'Talent Pool application not found.', 404);
  }
  const appRow = app as { id: string; user_id: string; status: string };

  // Fail-closed audit log before disclosing candidate PII, transcript, and assessment evidence.
  await requireAuditEvent({
    action: 'ADMIN_TALENT_APPLICATION_VIEWED',
    resource: 'talent_applications',
    resourceId: applicationId,
    userId: adminUserId,
    outcome: 'allow',
    meta: { candidate_user_id: appRow.user_id },
  });

  const [
    profileRes,
    careerRes,
    tpProfileRes,
    snapshotRes,
    consentsRes,
    sessionsRes,
    reportsRes,
    dimensionsRes,
    reviewsRes,
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('user_id,full_name,email,phone,target_roles,account_status').eq('user_id', appRow.user_id).maybeSingle(),
    supabaseAdmin.from('career_profiles').select('*').eq('user_id', appRow.user_id).maybeSingle(),
    supabaseAdmin.from('talent_pool_profiles').select('*').eq('user_id', appRow.user_id).maybeSingle(),
    supabaseAdmin
      .from('talent_application_snapshots')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('talent_consents')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('talent_interview_sessions')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('talent_assessment_reports')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('talent_assessment_dimensions')
      .select('*')
      .eq('application_id', applicationId)
      .order('dimension_key', { ascending: true }),
    supabaseAdmin
      .from('talent_admin_reviews')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false }),
  ]);

  const sessions = (sessionsRes.data ?? []) as Array<{ id: string }>;
  const latestSessionId = sessions[0]?.id ?? null;

  let questions: unknown[] = [];
  let answers: unknown[] = [];
  let transcripts: unknown[] = [];
  let recordings: unknown[] = [];

  if (latestSessionId) {
    const [qRes, aRes, tRes, rRes] = await Promise.all([
      supabaseAdmin
        .from('talent_interview_questions')
        .select('*')
        .eq('session_id', latestSessionId)
        .order('sequence_no', { ascending: true }),
      supabaseAdmin
        .from('talent_interview_answers')
        .select('*')
        .eq('session_id', latestSessionId)
        .order('submitted_at', { ascending: true }),
      supabaseAdmin
        .from('talent_interview_transcripts')
        .select('*')
        .eq('session_id', latestSessionId)
        .order('turn_index', { ascending: true }),
      supabaseAdmin
        .from('talent_interview_recordings')
        .select('id,segment_index,mime_type,byte_size,duration_ms,has_video,has_audio,sha256,created_at')
        .eq('session_id', latestSessionId)
        .order('segment_index', { ascending: true }),
    ]);
    questions = qRes.data ?? [];
    answers = aRes.data ?? [];
    transcripts = tRes.data ?? [];
    recordings = rRes.data ?? [];
  }

  return {
    application: app,
    profile: profileRes.data,
    career: careerRes.data,
    talentProfile: tpProfileRes.data,
    snapshot: snapshotRes.data,
    consents: consentsRes.data ?? [],
    sessions,
    questions,
    answers,
    transcripts,
    recordings,
    reports: reportsRes.data ?? [],
    dimensions: dimensionsRes.data ?? [],
    reviews: reviewsRes.data ?? [],
  };
}

export async function issueAdminRecordingSignedUrl(adminUserId: string, recordingId: string) {
  const { data: rec } = await supabaseAdmin
    .from('talent_interview_recordings')
    .select('id,session_id,user_id,bucket_id,storage_path,mime_type')
    .eq('id', recordingId)
    .maybeSingle();

  if (!rec) {
    throw new TalentPoolError('RECORDING_NOT_FOUND', 'Recording segment not found.', 404);
  }
  const r = rec as {
    id: string;
    session_id: string;
    user_id: string;
    bucket_id: string;
    storage_path: string;
    mime_type: string;
  };

  // Fail-closed audit log before minting private media playback URL.
  await requireAuditEvent({
    action: 'ADMIN_TALENT_RECORDING_ACCESSED',
    resource: 'talent_interview_recordings',
    resourceId: r.id,
    userId: adminUserId,
    outcome: 'allow',
    meta: { session_id: r.session_id, candidate_user_id: r.user_id },
  });

  const { data: signed, error } = await supabaseAdmin.storage
    .from(r.bucket_id)
    .createSignedUrl(r.storage_path, 90);

  if (error || !signed?.signedUrl) {
    throw new TalentPoolError('SIGNED_URL_FAILED', 'Unable to mint short-lived playback URL.', 500);
  }

  return { signedUrl: signed.signedUrl, mimeType: r.mime_type, expiresInSeconds: 90 };
}

export async function recordAdminTalentDecision(
  adminUserId: string,
  applicationId: string,
  input: z.infer<typeof adminDecisionSchema>,
) {
  const { data: app } = await supabaseAdmin
    .from('talent_applications')
    .select('id,user_id,status')
    .eq('id', applicationId)
    .maybeSingle();

  if (!app) {
    throw new TalentPoolError('APPLICATION_NOT_FOUND', 'Talent Pool application not found.', 404);
  }
  const appRow = app as { id: string; user_id: string; status: TalentApplicationStatus };

  const newStatus: TalentApplicationStatus =
    input.decision === 'APPROVE'
      ? 'APPROVED'
      : input.decision === 'REJECT'
        ? 'REJECTED'
        : 'REASSESSMENT_REQUESTED';

  const now = new Date();
  const nowIso = now.toISOString();
  const cooldownIso =
    input.decision === 'REJECT' ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

  // Fail-closed audit event BEFORE applying state change.
  await requireAuditEvent({
    action: `ADMIN_TALENT_${input.decision}`,
    resource: 'talent_applications',
    resourceId: applicationId,
    userId: adminUserId,
    outcome: 'allow',
    meta: {
      candidate_user_id: appRow.user_id,
      previous_status: appRow.status,
      new_status: newStatus,
      reason: input.reason ?? null,
    },
  });

  const { error: revErr } = await supabaseAdmin.from('talent_admin_reviews').insert({
    application_id: applicationId,
    reviewer_id: adminUserId,
    decision: input.decision,
    reason: input.reason ?? null,
    candidate_feedback: input.candidate_feedback ?? (input.decision !== 'APPROVE' ? input.reason ?? null : null),
    reassessment_instructions:
      input.decision === 'REQUEST_REASSESSMENT'
        ? input.reassessment_instructions || input.reason || null
        : null,
    internal_notes: input.internal_notes ?? null,
    previous_status: appRow.status,
    new_status: newStatus,
    created_at: nowIso,
  });

  if (revErr) {
    throw new TalentPoolError('REVIEW_INSERT_FAILED', 'Unable to record administrator review.', 500);
  }

  const { error: appErr } = await supabaseAdmin
    .from('talent_applications')
    .update({
      status: newStatus,
      decided_at: nowIso,
      assigned_reviewer_id: input.assign_to_self ? adminUserId : undefined,
      candidate_feedback: input.candidate_feedback ?? (input.decision !== 'APPROVE' ? input.reason ?? null : null),
      reassessment_instructions:
        input.decision === 'REQUEST_REASSESSMENT'
          ? input.reassessment_instructions || input.reason || null
          : null,
      reapplication_permitted: input.decision === 'REQUEST_REASSESSMENT',
      reapplication_allowed_after: cooldownIso,
      updated_at: nowIso,
    })
    .eq('id', applicationId);

  if (appErr) {
    throw new TalentPoolError('APPLICATION_DECISION_UPDATE_FAILED', 'Unable to update application status.', 500);
  }

  if (input.decision === 'APPROVE') {
    await supabaseAdmin
      .from('talent_pool_profiles')
      .upsert({ user_id: appRow.user_id, approved_at: nowIso, updated_at: nowIso }, { onConflict: 'user_id' });
  }

  // Record in shared admin_actions table best-effort.
  try {
    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: adminUserId,
      target_user_id: appRow.user_id,
      action: `TALENT_POOL_${input.decision}`,
      reason: input.reason || 'Approved for Jobiest Talent Pool',
    });
  } catch {}

  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('full_name,email')
    .eq('user_id', appRow.user_id)
    .maybeSingle();
  const p = prof as { full_name?: string | null; email?: string | null } | null;

  const notificationCopy =
    input.decision === 'APPROVE'
      ? {
          title: 'You are approved in the Jobiest Talent Pool',
          body: 'Congratulations. Your Talent Pool profile has been reviewed and approved. You can manage your visibility, CV permissions, and employer outreach from your Talent Pool dashboard.',
          subject: 'You are approved in the Jobiest Talent Pool',
        }
      : input.decision === 'REQUEST_REASSESSMENT'
        ? {
            title: 'Reassessment requested for your Talent Pool application',
            body: `Our review team invited you to complete a fresh assessment: ${input.reassessment_instructions || input.reason || 'Open your Talent Pool dashboard for guidance.'}`,
            subject: 'Update on your Jobiest Talent Pool assessment',
          }
        : {
            title: 'Update on your Jobiest Talent Pool application',
            body: `Your Talent Pool application was not approved on this cycle. Feedback: ${input.candidate_feedback || input.reason || 'See your dashboard for details.'}`,
            subject: 'Decision on your Jobiest Talent Pool application',
          };

  await notifyUser({
    userId: appRow.user_id,
    type: 'talent_pool',
    title: notificationCopy.title,
    body: notificationCopy.body,
    deepLink: '/talent-pool',
    email: {
      to: p?.email,
      firstName: p?.full_name,
      subject: notificationCopy.subject,
      ctaLabel: 'Open Talent Pool',
    },
  });

  return { ok: true, previousStatus: appRow.status, newStatus };
}

export async function listAdminEmployers(adminUserId: string) {
  await requireAuditEvent({
    action: 'ADMIN_EMPLOYERS_LISTED',
    resource: 'employer_organizations',
    userId: adminUserId,
    outcome: 'allow',
  });

  const [orgsRes, reportsRes, placementsRes] = await Promise.all([
    supabaseAdmin
      .from('employer_organizations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('talent_interaction_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('talent_placements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return {
    organizations: orgsRes.data ?? [],
    reports: reportsRes.data ?? [],
    placements: placementsRes.data ?? [],
  };
}

export async function decideEmployerVerification(
  adminUserId: string,
  organizationId: string,
  input: z.infer<typeof adminEmployerDecisionSchema>,
) {
  const { data: org } = await supabaseAdmin
    .from('employer_organizations')
    .select('id,company_name,business_email,created_by,verification_status')
    .eq('id', organizationId)
    .maybeSingle();

  if (!org) {
    throw new TalentPoolError('EMPLOYER_NOT_FOUND', 'Employer organization not found.', 404);
  }
  const orgRow = org as {
    id: string;
    company_name: string;
    business_email: string;
    created_by: string;
    verification_status: string;
  };

  const nextStatus =
    input.decision === 'VERIFY' ? 'VERIFIED' : input.decision === 'REJECT' ? 'REJECTED' : 'SUSPENDED';
  const nowIso = new Date().toISOString();

  await requireAuditEvent({
    action: `ADMIN_EMPLOYER_${input.decision}`,
    resource: 'employer_organizations',
    resourceId: organizationId,
    userId: adminUserId,
    outcome: 'allow',
    meta: {
      previous_status: orgRow.verification_status,
      new_status: nextStatus,
      reason: input.reason ?? null,
    },
  });

  await supabaseAdmin
    .from('employer_organizations')
    .update({
      verification_status: nextStatus,
      verified_at: input.decision === 'VERIFY' ? nowIso : null,
      verified_by: adminUserId,
      rejection_reason: input.decision === 'VERIFY' ? null : input.reason ?? null,
      updated_at: nowIso,
    })
    .eq('id', organizationId);

  await supabaseAdmin
    .from('employer_verifications')
    .update({
      status: input.decision === 'VERIFY' ? 'APPROVED' : 'REJECTED',
      reviewed_by: adminUserId,
      review_reason: input.reason ?? null,
      reviewed_at: nowIso,
    })
    .eq('organization_id', organizationId)
    .eq('status', 'SUBMITTED');

  await notifyUser({
    userId: orgRow.created_by,
    type: 'employer',
    title:
      input.decision === 'VERIFY'
        ? `${orgRow.company_name} is verified for Jobiest Talent Pool`
        : `Verification update for ${orgRow.company_name}`,
    body:
      input.decision === 'VERIFY'
        ? 'Your employer account is now verified. You can search approved candidates, create shortlists, and send interview invitations.'
        : `Status: ${nextStatus}. Note: ${input.reason ?? 'Contact support@jobiest.com for assistance.'}`,
    deepLink: '/employer',
    email: {
      to: orgRow.business_email,
      subject:
        input.decision === 'VERIFY'
          ? `${orgRow.company_name} verified on Jobiest Recruiter Hub`
          : `Update on ${orgRow.company_name} verification`,
      ctaLabel: 'Open Recruiter Hub',
    },
  });

  return { ok: true, verification_status: nextStatus };
}
