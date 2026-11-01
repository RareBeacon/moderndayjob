import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent } from '@/lib/audit';
import { notifyUser } from '@/lib/notifications/dispatch';
import {
  ACTIVE_APPLICATION_STATUSES,
  CONSENT_DEFINITIONS,
  CONSENT_PURPOSES,
  CONSENT_VERSION,
  type AssessmentRoute,
  type ConsentPurpose,
  type TalentApplicationStatus,
  type TalentDisplayStatus,
} from './constants';
import { inspectCandidateOnboarding, type OnboardingInspectionResult } from './onboarding-inspector';
import type {
   TalentApplicationSubmitInput,
  TalentIntakeUpdateInput,
  talentVisibilitySettingsSchema,
  talentWithdrawSchema,
} from './schemas';
import type { z } from 'zod';

export class TalentPoolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TalentPoolError';
  }
}

export interface CandidateHistoryItem {
  id: string;
  attempt_number: number;
  status: TalentApplicationStatus;
  assessment_route: AssessmentRoute;
  career_category: string | null;
  seniority_level: string | null;
  scheduled_interview_at: string | null;
  submitted_at: string | null;
  interview_completed_at: string | null;
  review_submitted_at: string | null;
  decided_at: string | null;
  withdrawn_at: string | null;
  candidate_feedback: string | null;
  reassessment_instructions: string | null;
  latest_score: number | null;
  created_at: string;
  latest_session: {
    id: string;
    mode: AssessmentRoute;
    state: string;
    current_question_index: number;
    total_questions: number;
    started_at: string | null;
    completed_at: string | null;
    submitted_for_review_at: string | null;
  } | null;
}

export interface CandidateTalentPoolOverview {
  displayStatus: TalentDisplayStatus;
  onboarding: OnboardingInspectionResult;
  activeApplication: CandidateHistoryItem | null;
  history: CandidateHistoryItem[];
  consents: Record<ConsentPurpose, { granted: boolean; version: string | null; granted_at: string | null }>;
  preferences: {
    visibility: 'ACTIVE' | 'PAUSED';
    allow_cv_access: boolean;
    allow_contact_requests: boolean;
    blocked_employer_domains: string[];
  };
  pendingContactRequestsCount: number;
}

function computeDisplayStatus(
  latestApp: CandidateHistoryItem | null,
  readyToApply: boolean,
): TalentDisplayStatus {
  if (!latestApp) {
    return readyToApply ? 'NOT_APPLIED' : 'PROFILE_INCOMPLETE';
  }
  const st = latestApp.status;
  if (st === 'PROFILE_INCOMPLETE') {
    return readyToApply ? 'NOT_APPLIED' : 'PROFILE_INCOMPLETE';
  }
  if (st === 'APPLICATION_SUBMITTED' || st === 'ASSESSMENT_PENDING') {
    const sessState = latestApp.latest_session?.state;
    if (sessState === 'IN_PROGRESS' || sessState === 'PROCESSING') {
      return 'ASSESSMENT_IN_PROGRESS';
    }
    return st;
  }
  return st;
}

export async function getCandidateTalentPoolOverview(
  userId: string,
  fallbackEmail?: string | null,
): Promise<CandidateTalentPoolOverview> {
  const [onboarding, appsRes, tpProfileRes, consentsRes, contactCountRes] = await Promise.all([
    inspectCandidateOnboarding(userId, fallbackEmail),
    supabaseAdmin
      .from('talent_applications')
      .select(
        'id,attempt_number,status,assessment_route,career_category,seniority_level,scheduled_interview_at,submitted_at,interview_completed_at,review_submitted_at,decided_at,withdrawn_at,candidate_feedback,reassessment_instructions,latest_score,created_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('talent_pool_profiles')
      .select('visibility,allow_cv_access,allow_contact_requests,blocked_employer_domains')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('talent_consents')
      .select('purpose,granted,consent_version,granted_at,withdrawn_at,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('talent_contact_requests')
      .select('*', { count: 'exact', head: true })
      .eq('candidate_user_id', userId)
      .eq('status', 'PENDING'),
  ]);

  const rawApps = (appsRes.data ?? []) as Array<Omit<CandidateHistoryItem, 'latest_session'>>;
  const appIds = rawApps.map((a) => a.id);

  const sessionsByApp = new Map<string, CandidateHistoryItem['latest_session']>();
  if (appIds.length > 0) {
    const { data: sessions } = await supabaseAdmin
      .from('talent_interview_sessions')
      .select(
        'id,application_id,mode,state,current_question_index,total_questions,started_at,completed_at,submitted_for_review_at,created_at',
      )
      .eq('user_id', userId)
      .in('application_id', appIds)
      .order('created_at', { ascending: false });

    for (const s of (sessions ?? []) as Array<{
      id: string;
      application_id: string;
      mode: AssessmentRoute;
      state: string;
      current_question_index: number;
      total_questions: number;
      started_at: string | null;
      completed_at: string | null;
      submitted_for_review_at: string | null;
    }>) {
      if (!sessionsByApp.has(s.application_id)) {
        sessionsByApp.set(s.application_id, {
          id: s.id,
          mode: s.mode,
          state: s.state,
          current_question_index: s.current_question_index,
          total_questions: s.total_questions,
          started_at: s.started_at,
          completed_at: s.completed_at,
          submitted_for_review_at: s.submitted_for_review_at,
        });
      }
    }
  }

  const history: CandidateHistoryItem[] = rawApps.map((a) => ({
    ...a,
    latest_score: a.latest_score !== null && a.latest_score !== undefined ? Number(a.latest_score) : null,
    latest_session: sessionsByApp.get(a.id) ?? null,
  }));

  const activeApplication =
    history.find((h) => ACTIVE_APPLICATION_STATUSES.has(h.status)) ?? history[0] ?? null;

  const latestConsentByPurpose: CandidateTalentPoolOverview['consents'] = {
    AI_ASSESSMENT: { granted: false, version: null, granted_at: null },
    AUDIO_VIDEO_PROCESSING: { granted: false, version: null, granted_at: null },
    INTERVIEW_RECORDING: { granted: false, version: null, granted_at: null },
    HUMAN_ASSESSMENT_REVIEW: { granted: false, version: null, granted_at: null },
    EMPLOYER_DISCOVERY: { granted: false, version: null, granted_at: null },
    DATA_RETENTION_WITHDRAWAL: { granted: false, version: null, granted_at: null },
  };
  const seenPurposes = new Set<string>();
  for (const row of (consentsRes.data ?? []) as Array<{
    purpose: ConsentPurpose;
    granted: boolean;
    consent_version: string;
    granted_at: string | null;
    withdrawn_at: string | null;
  }>) {
    if (seenPurposes.has(row.purpose)) continue;
    seenPurposes.add(row.purpose);
    if (CONSENT_PURPOSES.includes(row.purpose)) {
      latestConsentByPurpose[row.purpose] = {
        granted: Boolean(row.granted && !row.withdrawn_at),
        version: row.consent_version,
        granted_at: row.granted_at,
      };
    }
  }

  const tp = tpProfileRes.data as {
    visibility?: 'ACTIVE' | 'PAUSED';
    allow_cv_access?: boolean;
    allow_contact_requests?: boolean;
    blocked_employer_domains?: string[];
  } | null;

  return {
    displayStatus: computeDisplayStatus(history[0] ?? null, onboarding.readyToApply),
    onboarding,
    activeApplication,
    history,
    consents: latestConsentByPurpose,
    preferences: {
      visibility: tp?.visibility === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
      allow_cv_access: Boolean(tp?.allow_cv_access),
      allow_contact_requests: tp?.allow_contact_requests !== false,
      blocked_employer_domains: Array.isArray(tp?.blocked_employer_domains)
        ? tp!.blocked_employer_domains
        : [],
    },
    pendingContactRequestsCount: contactCountRes.count ?? 0,
  };
}

export async function saveCandidateIntake(
  userId: string,
  fallbackEmail: string | null | undefined,
  input: TalentIntakeUpdateInput,
): Promise<OnboardingInspectionResult> {
  const now = new Date().toISOString();

  // Preserve existing career_profiles.summary and links fields if already set.
  const { data: existingCareer } = await supabaseAdmin
    .from('career_profiles')
    .select('summary,links')
    .eq('user_id', userId)
    .maybeSingle();

  const existingLinks =
    existingCareer?.links && typeof existingCareer.links === 'object'
      ? (existingCareer.links as Record<string, unknown>)
      : {};

  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .update({
      full_name: input.full_name,
      target_roles: input.target_roles,
      updated_at: now,
    })
    .eq('user_id', userId);
  if (profileErr) {
    throw new TalentPoolError('PROFILE_SAVE_FAILED', 'Unable to update your profile.', 500);
  }

  const { error: careerErr } = await supabaseAdmin.from('career_profiles').upsert(
    {
      user_id: userId,
      headline: input.headline,
      summary: (existingCareer as { summary?: string | null } | null)?.summary ?? null,
      skills: input.skills,
      experience: input.experience,
      education: input.education,
      projects: input.projects,
      not_applicable: input.not_applicable,
      links: {
        ...existingLinks,
        ...(input.portfolio_url !== undefined ? { portfolio: input.portfolio_url || '' } : {}),
      },
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );
  if (careerErr) {
    throw new TalentPoolError('CAREER_PROFILE_SAVE_FAILED', 'Unable to update your career details.', 500);
  }

  // Update job_preferences while preserving existing fields (e.g. application_mode).
  const { data: existingPrefs } = await supabaseAdmin
    .from('job_preferences')
    .select('locations')
    .eq('user_id', userId)
    .maybeSingle();

  const mergedLocations = Array.from(
    new Set([
      `${input.location}, ${input.country}`,
      ...(((existingPrefs as { locations?: string[] } | null)?.locations ?? []).filter(Boolean)),
    ]),
  ).slice(0, 10);

  const { error: prefsErr } = await supabaseAdmin.from('job_preferences').upsert(
    {
      user_id: userId,
      locations: mergedLocations,
      employment_types: input.employment_types,
      remote_types: input.remote_types,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );
  if (prefsErr) {
    throw new TalentPoolError('PREFERENCES_SAVE_FAILED', 'Unable to update your work preferences.', 500);
  }

  const { error: tpErr } = await supabaseAdmin.from('talent_pool_profiles').upsert(
    {
      user_id: userId,
      location: input.location,
      country: input.country,
      time_zone: input.time_zone,
      career_category: input.career_category,
      seniority_level: input.seniority_level,
      years_of_experience: input.years_of_experience,
      technical_competencies: input.technical_competencies,
      certifications: input.certifications,
      relevant_qualifications: input.relevant_qualifications,
      salary_currency: input.salary_currency,
      salary_min: input.salary_min ?? null,
      salary_max: input.salary_max ?? null,
      availability: input.availability,
      work_authorization: input.work_authorization,
      preferred_assessment_route: input.preferred_assessment_route,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );
  if (tpErr) {
    throw new TalentPoolError('TALENT_PROFILE_SAVE_FAILED', 'Unable to save Talent Pool details.', 500);
  }

  return inspectCandidateOnboarding(userId, fallbackEmail);
}

export async function submitTalentApplication(
  userId: string,
  fallbackEmail: string | null | undefined,
  input: TalentApplicationSubmitInput,
  signals: { ipHash?: string | null; uaHash?: string | null } = {},
): Promise<{ applicationId: string; sessionId: string; status: TalentApplicationStatus }> {
  const onboarding = await inspectCandidateOnboarding(userId, fallbackEmail);
  if (!onboarding.readyToApply) {
    throw new TalentPoolError(
      'PROFILE_INCOMPLETE',
      'Complete all required onboarding fields before submitting your Talent Pool application.',
      400,
      { missingRequired: onboarding.missingRequired.map((f) => f.key) },
    );
  }

  // Enforce explicit, unbundled consent for every purpose required by the chosen route.
  const missingConsents: ConsentPurpose[] = [];
  for (const def of CONSENT_DEFINITIONS) {
    if (def.requiredForRoutes.includes(input.assessment_route) && !input.consents[def.purpose]) {
      missingConsents.push(def.purpose);
    }
  }
  if (missingConsents.length > 0) {
    throw new TalentPoolError(
      'CONSENT_REQUIRED',
      'Each required consent item must be explicitly granted before submission.',
      400,
      { missingConsents },
    );
  }

  // Check existing applications to block duplicate active submissions unless reassessment/reapplication is permitted.
  const { data: existingApps } = await supabaseAdmin
    .from('talent_applications')
    .select('id,status,attempt_number,reapplication_permitted,reapplication_allowed_after')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  const existingList = (existingApps ?? []) as Array<{
    id: string;
    status: TalentApplicationStatus;
    attempt_number: number;
    reapplication_permitted: boolean;
    reapplication_allowed_after: string | null;
  }>;

  const latest = existingList[0] ?? null;
  const now = new Date();
  const nowIso = now.toISOString();

  if (latest) {
    if (
      latest.status === 'APPLICATION_SUBMITTED' ||
      latest.status === 'ASSESSMENT_PENDING' ||
      latest.status === 'INTERVIEW_SCHEDULED' ||
      latest.status === 'ASSESSMENT_IN_PROGRESS' ||
      latest.status === 'UNDER_ADMIN_REVIEW' ||
      latest.status === 'APPROVED'
    ) {
      throw new TalentPoolError(
        'DUPLICATE_ACTIVE_APPLICATION',
        `You already have an active Talent Pool application (${latest.status}).`,
        409,
        { applicationId: latest.id, status: latest.status },
      );
    }
    if (latest.status === 'REJECTED' && !latest.reapplication_permitted) {
      const allowedAfterMs = latest.reapplication_allowed_after
        ? new Date(latest.reapplication_allowed_after).getTime()
        : Number.POSITIVE_INFINITY;
      if (now.getTime() < allowedAfterMs) {
        throw new TalentPoolError(
          'REAPPLICATION_COOLDOWN',
          'Reapplication is not yet available for this account.',
          403,
          { allowedAfter: latest.reapplication_allowed_after },
        );
      }
    }
  }

  const nextStatus: TalentApplicationStatus = input.scheduled_interview_at
    ? 'INTERVIEW_SCHEDULED'
    : 'ASSESSMENT_PENDING';

  // Persist visibility and CV/contact preferences chosen during review.
  await supabaseAdmin.from('talent_pool_profiles').upsert(
    {
      user_id: userId,
      allow_cv_access: input.allow_cv_access,
      allow_contact_requests: input.allow_contact_requests,
      blocked_employer_domains: input.blocked_employer_domains,
      preferred_assessment_route: input.assessment_route,
      visibility: 'ACTIVE',
      updated_at: nowIso,
    },
    { onConflict: 'user_id' },
  );

  let applicationId: string;
  if (latest && (latest.status === 'PROFILE_INCOMPLETE' || latest.status === 'REASSESSMENT_REQUESTED')) {
    const nextAttempt = latest.status === 'REASSESSMENT_REQUESTED' ? latest.attempt_number + 1 : latest.attempt_number;
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('talent_applications')
      .update({
        status: nextStatus,
        career_category: onboarding.snapshot.career_category,
        seniority_level: onboarding.snapshot.seniority_level,
        assessment_route: input.assessment_route,
        attempt_number: nextAttempt,
        scheduled_interview_at: input.scheduled_interview_at ?? null,
        submitted_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', latest.id)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (updateErr || !updated) {
      throw new TalentPoolError('APPLICATION_SUBMIT_FAILED', 'Could not update your Talent Pool application.', 500);
    }
    applicationId = (updated as { id: string }).id;
  } else {
    const nextAttempt = latest ? latest.attempt_number + 1 : 1;
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('talent_applications')
      .insert({
        user_id: userId,
        status: nextStatus,
        career_category: onboarding.snapshot.career_category,
        seniority_level: onboarding.snapshot.seniority_level,
        assessment_route: input.assessment_route,
        attempt_number: nextAttempt,
        scheduled_interview_at: input.scheduled_interview_at ?? null,
        submitted_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      throw new TalentPoolError('APPLICATION_SUBMIT_FAILED', 'Could not create your Talent Pool application.', 500);
    }
    applicationId = (inserted as { id: string }).id;
  }

  // Preserve immutable application snapshot.
  const { error: snapErr } = await supabaseAdmin.from('talent_application_snapshots').insert({
    application_id: applicationId,
    user_id: userId,
    snapshot_data: onboarding.snapshot,
    master_cv_document_id: onboarding.masterCvDocumentId,
    portfolio_id: onboarding.portfolioId,
    completeness_score: onboarding.completenessScore,
    created_at: nowIso,
  });
  if (snapErr) {
    throw new TalentPoolError('SNAPSHOT_SAVE_FAILED', 'Could not record your application profile snapshot.', 500);
  }

  // Record 6 independent consent rows with explicit consent_version and timestamps.
  const consentRows = CONSENT_DEFINITIONS.map((def) => {
    const granted = Boolean(input.consents[def.purpose]);
    return {
      user_id: userId,
      application_id: applicationId,
      purpose: def.purpose,
      granted,
      consent_version: CONSENT_VERSION,
      policy_summary: def.summary,
      granted_at: granted ? nowIso : null,
      withdrawn_at: null,
      ip_hash: signals.ipHash ?? null,
      ua_hash: signals.uaHash ?? null,
      created_at: nowIso,
    };
  });

  const { error: consentErr } = await supabaseAdmin.from('talent_consents').insert(consentRows);
  if (consentErr) {
    throw new TalentPoolError('CONSENT_SAVE_FAILED', 'Could not persist consent records.', 500);
  }

  // Provision initial interview session in CREATED state so candidate can precheck or recover anytime.
  const { data: sessionRow, error: sessionErr } = await supabaseAdmin
    .from('talent_interview_sessions')
    .insert({
      application_id: applicationId,
      user_id: userId,
      mode: input.assessment_route,
      state: 'CREATED',
      camera_permission: input.assessment_route === 'VIDEO_VOICE' ? 'UNCHECKED' : 'NOT_APPLICABLE',
      microphone_permission:
        input.assessment_route === 'ACCESSIBLE_WRITTEN' ? 'NOT_APPLICABLE' : 'UNCHECKED',
      recording_active: false,
      current_question_index: 0,
      total_questions: 0,
      graph_state: { stage: 'CREATED', route: input.assessment_route },
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single();

  if (sessionErr || !sessionRow) {
    throw new TalentPoolError('INTERVIEW_SESSION_CREATE_FAILED', 'Could not initialize your assessment session.', 500);
  }

  const sessionId = (sessionRow as { id: string }).id;

  await auditEvent({
    action: 'TALENT_APPLICATION_SUBMITTED',
    resource: 'talent_applications',
    resourceId: applicationId,
    userId,
    outcome: 'allow',
    ipHash: signals.ipHash ?? null,
    uaHash: signals.uaHash ?? null,
    meta: {
      assessment_route: input.assessment_route,
      consent_version: CONSENT_VERSION,
      scheduled: Boolean(input.scheduled_interview_at),
      session_id: sessionId,
    },
  });

  await notifyUser({
    userId,
    type: 'talent_pool',
    title: 'Talent Pool application received',
    body: input.scheduled_interview_at
      ? 'Your Talent Pool application and profile snapshot are confirmed. Your assessment slot is scheduled.'
      : 'Your Talent Pool application and profile snapshot are confirmed. You can start your competency assessment whenever you are ready.',
    deepLink: `/talent-pool/interview/${sessionId}`,
    email: {
      to: onboarding.snapshot.email,
      firstName: onboarding.snapshot.full_name,
      subject: 'Your Jobiest Talent Pool application is confirmed',
      ctaLabel: 'Open my assessment',
    },
  });

  return { applicationId, sessionId, status: nextStatus };
}

export async function updateCandidatePreferences(
  userId: string,
  input: z.infer<typeof talentVisibilitySettingsSchema>,
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.allow_cv_access !== undefined) patch.allow_cv_access = input.allow_cv_access;
  if (input.allow_contact_requests !== undefined) patch.allow_contact_requests = input.allow_contact_requests;
  if (input.blocked_employer_domains !== undefined) {
    patch.blocked_employer_domains = input.blocked_employer_domains;
  }

  const { error } = await supabaseAdmin
    .from('talent_pool_profiles')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });

  if (error) {
    throw new TalentPoolError('PREFERENCES_UPDATE_FAILED', 'Unable to update your visibility settings.', 500);
  }

  await auditEvent({
    action: 'TALENT_VISIBILITY_UPDATED',
    resource: 'talent_pool_profiles',
    resourceId: userId,
    userId,
    outcome: 'allow',
    meta: patch,
  });
}

export async function withdrawTalentApplication(
  userId: string,
  fallbackEmail: string | null | undefined,
  input: z.infer<typeof talentWithdrawSchema>,
  signals: { ipHash?: string | null; uaHash?: string | null } = {},
): Promise<void> {
  const nowIso = new Date().toISOString();

  // Immediately hide candidate from discovery.
  await supabaseAdmin
    .from('talent_pool_profiles')
    .upsert({ user_id: userId, visibility: 'PAUSED', updated_at: nowIso }, { onConflict: 'user_id' });

  // Mark active application WITHDRAWN.
  const { data: activeApps } = await supabaseAdmin
    .from('talent_applications')
    .select('id,status')
    .eq('user_id', userId)
    .in('status', Array.from(ACTIVE_APPLICATION_STATUSES));

  const appIds = ((activeApps ?? []) as Array<{ id: string }>).map((a) => a.id);
  if (appIds.length > 0) {
    await supabaseAdmin
      .from('talent_applications')
      .update({ status: 'WITHDRAWN', withdrawn_at: nowIso, updated_at: nowIso })
      .eq('user_id', userId)
      .in('id', appIds);

    // Cancel any unfinished interview sessions so they never become completed.
    await supabaseAdmin
      .from('talent_interview_sessions')
      .update({
        state: 'CANCELLED',
        recording_active: false,
        cancellation_reason: input.reason || 'Candidate withdrew from Talent Pool.',
        updated_at: nowIso,
      })
      .eq('user_id', userId)
      .in('application_id', appIds)
      .in('state', ['CREATED', 'PRECHECK', 'READY', 'IN_PROGRESS', 'RETRY_PENDING']);
  }

  // Record consent withdrawal timestamps.
  if (input.revoke_consents.length > 0) {
    await supabaseAdmin
      .from('talent_consents')
      .update({ withdrawn_at: nowIso, granted: false })
      .eq('user_id', userId)
      .in('purpose', input.revoke_consents)
      .is('withdrawn_at', null);
  }

  await auditEvent({
    action: 'TALENT_APPLICATION_WITHDRAWN',
    resource: 'talent_applications',
    resourceId: appIds[0] ?? userId,
    userId,
    outcome: 'allow',
    ipHash: signals.ipHash ?? null,
    uaHash: signals.uaHash ?? null,
    meta: { revoked_consents: input.revoke_consents, has_reason: Boolean(input.reason) },
  });

  await notifyUser({
    userId,
    type: 'talent_pool',
    title: 'You withdrew from the Jobiest Talent Pool',
    body: 'Your Talent Pool profile is now withdrawn and removed from all employer searches. You can reapply whenever you choose.',
    deepLink: '/talent-pool',
    email: fallbackEmail
      ? {
          to: fallbackEmail,
          subject: 'Talent Pool withdrawal confirmed',
          ctaLabel: 'View Talent Pool status',
        }
      : undefined,
  });
}
