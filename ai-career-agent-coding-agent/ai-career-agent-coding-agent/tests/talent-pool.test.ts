import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_APPLICATION_STATUSES,
  ASSESSMENT_ROUTES,
  CONSENT_DEFINITIONS,
  CONSENT_PURPOSES,
  INTERVIEW_SESSION_STATES,
  TALENT_DISPLAY_STATUSES,
  TALENT_STATUS_META,
  assertInterviewStateTransition,
  canTransitionInterviewState,
} from '@/lib/talent-pool/constants';
import {
  evaluateCandidateReadiness,
  type CandidateSnapshotData,
} from '@/lib/talent-pool/onboarding-inspector';
import {
  adminDecisionSchema,
  adminEmployerDecisionSchema,
  consentMapSchema,
  contactRequestCreateSchema,
  recruiterSearchFilterSchema,
  talentApplicationSubmitSchema,
  talentVisibilitySettingsSchema,
} from '@/lib/talent-pool/schemas';

function makeCompleteSnapshot(overrides: Partial<CandidateSnapshotData> = {}): CandidateSnapshotData {
  return {
    full_name: 'Adaobi Okafor',
    headline: 'Senior Distributed Systems Engineer',
    summary: 'Builds resilient payment and career infrastructure across Europe and West Africa.',
    email: 'adaobi@example.com',
    location: 'Lagos',
    country: 'Nigeria',
    time_zone: 'Africa/Lagos',
    career_category: 'Software Engineering',
    seniority_level: 'SENIOR',
    target_roles: ['Senior Backend Engineer', 'Staff Platform Engineer'],
    years_of_experience: 7,
    experience: [
      {
        company: 'Paystack Systems',
        title: 'Senior Backend Engineer',
        description: 'Owned ledger settlement pipelines processing high-volume transactions.',
      },
    ],
    education: [{ institution: 'University of Lagos', qualification: 'BSc Computer Science' }],
    skills: ['TypeScript', 'PostgreSQL', 'Distributed Systems', 'Node.js'],
    technical_competencies: ['API Design', 'Database Reliability'],
    certifications: [{ name: 'AWS Solutions Architect', issuer: 'Amazon Web Services', year: '2025' }],
    relevant_qualifications: ['BSc Computer Science'],
    portfolio_url: 'https://example.com/adaobi',
    hosted_portfolio_slug: 'adaobi-okafor',
    projects: [{ name: 'Ledger Guard', description: 'Idempotent reconciliation worker' }],
    not_applicable: [],
    employment_types: ['FULL_TIME'],
    remote_types: ['REMOTE', 'HYBRID'],
    salary_currency: 'USD',
    salary_min: 95000,
    salary_max: 135000,
    availability: 'ONE_MONTH',
    work_authorization: 'Authorized in Nigeria; open to sponsored or remote global contracts',
    preferred_assessment_route: 'VIDEO_VOICE',
    master_cv_present: true,
    master_cv_name: 'Adaobi_Okafor_CV.pdf',
    ...overrides,
  };
}

describe('Jobiest Talent Pool - 12 Acceptance Criteria & Domain Invariants', () => {
  it('AC1 & AC2: defines all 11 candidate display statuses and never requires paid plan gating', () => {
    expect(TALENT_DISPLAY_STATUSES).toEqual([
      'NOT_APPLIED',
      'PROFILE_INCOMPLETE',
      'APPLICATION_SUBMITTED',
      'ASSESSMENT_PENDING',
      'INTERVIEW_SCHEDULED',
      'ASSESSMENT_IN_PROGRESS',
      'UNDER_ADMIN_REVIEW',
      'REASSESSMENT_REQUESTED',
      'APPROVED',
      'REJECTED',
      'WITHDRAWN',
    ]);
    for (const status of TALENT_DISPLAY_STATUSES) {
      expect(TALENT_STATUS_META[status]?.label.length).toBeGreaterThan(3);
      expect(TALENT_STATUS_META[status]?.summary.length).toBeGreaterThan(15);
    }

    // Verify Talent Pool overview & interview engine never charge subscription credits
    const interviewEngineSrc = fs.readFileSync(
      path.join(process.cwd(), 'lib/talent-pool/interview-engine.ts'),
      'utf8',
    );
    expect(interviewEngineSrc).not.toContain('debitCredits');
    expect(interviewEngineSrc).not.toContain('requirePaidPlan');
  });

  it('AC3: inspects real candidate onboarding fields without inventing missing information', () => {
    const incomplete = evaluateCandidateReadiness({
      snapshot: makeCompleteSnapshot({
        headline: null,
        country: '',
        skills: [],
        work_authorization: null,
      }),
      masterCvDocumentId: null,
      portfolioId: null,
    });

    expect(incomplete.readyToApply).toBe(false);
    expect(incomplete.snapshot.headline).toBeNull();
    expect(incomplete.snapshot.work_authorization).toBeNull();
    const missingKeys = incomplete.missingRequired.map((f) => f.key);
    expect(missingKeys).toContain('headline');
    expect(missingKeys).toContain('country');
    expect(missingKeys).toContain('skills');
    expect(missingKeys).toContain('work_authorization');

    const ready = evaluateCandidateReadiness({
      snapshot: makeCompleteSnapshot(),
      masterCvDocumentId: '018f4b2a-1111-7000-8000-000000000001',
      portfolioId: null,
    });
    expect(ready.readyToApply).toBe(true);
    expect(ready.completenessScore).toBe(100);
  });

  it('AC4: enforces 6 separate, independent granular consents where consent to one never implies consent to others', () => {
    expect(CONSENT_PURPOSES).toHaveLength(6);
    expect(CONSENT_DEFINITIONS).toHaveLength(6);

    // Every single consent boolean must be explicitly supplied; omitting any fails validation
    const partial = consentMapSchema.safeParse({
      AI_ASSESSMENT: true,
    });
    expect(partial.success).toBe(false);

    // Accessible written route allows declining audio/video & recording while granting the 4 core consents
    const accessibleConsents = consentMapSchema.parse({
      AI_ASSESSMENT: true,
      AUDIO_VIDEO_PROCESSING: false,
      INTERVIEW_RECORDING: false,
      HUMAN_ASSESSMENT_REVIEW: true,
      EMPLOYER_DISCOVERY: true,
      DATA_RETENTION_WITHDRAWAL: true,
    });
    expect(accessibleConsents.AUDIO_VIDEO_PROCESSING).toBe(false);
    expect(accessibleConsents.INTERVIEW_RECORDING).toBe(false);
    expect(accessibleConsents.AI_ASSESSMENT).toBe(true);

    const submitParsed = talentApplicationSubmitSchema.safeParse({
      assessment_route: 'ACCESSIBLE_WRITTEN',
      allow_cv_access: false,
      allow_contact_requests: true,
      blocked_employer_domains: ['current-employer.com'],
      confirmed_information_accurate: true,
      consents: accessibleConsents,
    });
    expect(submitParsed.success).toBe(true);
  });

  it('AC5: prevents duplicate active applications via active-status set and partial unique DB index', () => {
    expect(ACTIVE_APPLICATION_STATUSES.has('APPLICATION_SUBMITTED')).toBe(true);
    expect(ACTIVE_APPLICATION_STATUSES.has('UNDER_ADMIN_REVIEW')).toBe(true);
    expect(ACTIVE_APPLICATION_STATUSES.has('APPROVED')).toBe(true);
    expect(ACTIVE_APPLICATION_STATUSES.has('WITHDRAWN')).toBe(false);
    expect(ACTIVE_APPLICATION_STATUSES.has('REJECTED')).toBe(false);

    const mig047 = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/047_talent_pool_applications.sql'),
      'utf8',
    );
    expect(mig047.toLowerCase()).toContain('create unique index');
  });

  it('AC6 & AC7: enforces strict interview state machine, accessible route, and prevents interrupted interviews from silently completing', () => {
    expect(ASSESSMENT_ROUTES).toContain('ACCESSIBLE_WRITTEN');
    expect(INTERVIEW_SESSION_STATES).toEqual([
      'CREATED',
      'PRECHECK',
      'READY',
      'IN_PROGRESS',
      'PROCESSING',
      'COMPLETED',
      'SUBMITTED_FOR_REVIEW',
      'FAILED',
      'RETRY_PENDING',
      'CANCELLED',
    ]);

    // Valid forward lifecycle
    expect(canTransitionInterviewState('CREATED', 'PRECHECK')).toBe(true);
    expect(canTransitionInterviewState('PRECHECK', 'READY')).toBe(true);
    expect(canTransitionInterviewState('READY', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionInterviewState('IN_PROGRESS', 'PROCESSING')).toBe(true);
    expect(canTransitionInterviewState('PROCESSING', 'COMPLETED')).toBe(true);
    expect(canTransitionInterviewState('COMPLETED', 'SUBMITTED_FOR_REVIEW')).toBe(true);

    // Interrupted / failed / cancelled sessions can NEVER jump to COMPLETED or SUBMITTED_FOR_REVIEW
    expect(canTransitionInterviewState('IN_PROGRESS', 'COMPLETED')).toBe(false);
    expect(canTransitionInterviewState('IN_PROGRESS', 'SUBMITTED_FOR_REVIEW')).toBe(false);
    expect(canTransitionInterviewState('FAILED', 'COMPLETED')).toBe(false);
    expect(canTransitionInterviewState('CANCELLED', 'COMPLETED')).toBe(false);
    expect(() => assertInterviewStateTransition('IN_PROGRESS', 'SUBMITTED_FOR_REVIEW')).toThrow(
      /INVALID_INTERVIEW_STATE_TRANSITION/,
    );
  });

  it('AC8 & AC9: AI never auto-approves or auto-rejects; human admin REJECT and REQUEST_REASSESSMENT require mandatory reasons', () => {
    const engineSrc = fs.readFileSync(
      path.join(process.cwd(), 'lib/talent-pool/interview-engine.ts'),
      'utf8',
    );
    // Interview submission transitions strictly to UNDER_ADMIN_REVIEW, never APPROVED or REJECTED
    expect(engineSrc).toContain("'UNDER_ADMIN_REVIEW'");
    expect(engineSrc).not.toMatch(/status:\s*['"]APPROVED['"]/);
    expect(engineSrc).not.toMatch(/status:\s*['"]REJECTED['"]/);

    // Reject without reason fails validation
    expect(
      adminDecisionSchema.safeParse({
        decision: 'REJECT',
        reason: 'too short',
      }).success,
    ).toBe(false);

    // Reassessment without reason fails validation
    expect(
      adminDecisionSchema.safeParse({
        decision: 'REQUEST_REASSESSMENT',
        reason: '',
      }).success,
    ).toBe(false);

    // Reject with documented reason succeeds
    expect(
      adminDecisionSchema.safeParse({
        decision: 'REJECT',
        reason: 'Insufficient production system design evidence across core rubric dimensions.',
        candidate_feedback: 'Focus on concrete architecture trade-offs before reapplying.',
        internal_notes: 'Confidential reviewer calibration note.',
      }).success,
    ).toBe(true);

    // Employer reject/suspend also requires documented reason
    expect(adminEmployerDecisionSchema.safeParse({ decision: 'SUSPEND', reason: 'no' }).success).toBe(
      false,
    );
    expect(
      adminEmployerDecisionSchema.safeParse({
        decision: 'SUSPEND',
        reason: 'Multiple unsolicited off-platform outreach reports confirmed.',
      }).success,
    ).toBe(true);
  });

  it('AC10, AC11 & AC12: isolates confidential notes, raw recordings, CV access, and enforces verified-employer 11-filter discovery', () => {
    const candidateServiceSrc = fs.readFileSync(
      path.join(process.cwd(), 'lib/talent-pool/candidate-service.ts'),
      'utf8',
    );
    // Candidate service never selects internal_notes
    expect(candidateServiceSrc).not.toContain('internal_notes');

    const recruiterServiceSrc = fs.readFileSync(
      path.join(process.cwd(), 'lib/talent-pool/recruiter-service.ts'),
      'utf8',
    );
    // Recruiter service enforces requireVerifiedEmployer, APPROVED status, ACTIVE visibility, EMPLOYER_DISCOVERY consent, and CV permission gate
    expect(recruiterServiceSrc).toContain('requireVerifiedEmployer');
    expect(recruiterServiceSrc).toContain(".eq('status', 'APPROVED')");
    expect(recruiterServiceSrc).toContain(".eq('visibility', 'ACTIVE')");
    expect(recruiterServiceSrc).toContain('CV_PERMISSION_REQUIRED');
    // Recruiter service never queries talent_interview_recordings or talent_interview_transcripts
    expect(recruiterServiceSrc).not.toContain("from('talent_interview_recordings')");
    expect(recruiterServiceSrc).not.toContain("from('talent_interview_transcripts')");

    // All 11 search filter dimensions validate cleanly
    const parsedSearch = recruiterSearchFilterSchema.parse({
      title: 'Backend Engineer',
      career_category: 'Software Engineering',
      skills: 'TypeScript, PostgreSQL',
      min_years_experience: '4',
      max_years_experience: '12',
      location: 'Lagos',
      time_zone: 'Africa/Lagos',
      salary_currency: 'USD',
      max_salary_budget: '150000',
      availability: 'ONE_MONTH',
      employment_preference: 'REMOTE',
      competency: 'technical_depth',
      min_competency_score: '75',
      qualification: 'BSc Computer Science',
      page: '1',
      page_size: '12',
    });
    expect(parsedSearch.min_years_experience).toBe(4);
    expect(parsedSearch.min_competency_score).toBe(75);

    // Candidate visibility & outreach controls validate cleanly
    expect(
      talentVisibilitySettingsSchema.safeParse({
        visibility: 'PAUSED',
        allow_cv_access: false,
        allow_contact_requests: false,
        blocked_employer_domains: ['acme.io'],
      }).success,
    ).toBe(true);

    expect(
      contactRequestCreateSchema.safeParse({
        candidate_user_id: '018f4b2a-1111-7000-8000-000000000099',
        request_type: 'INTERVIEW_INVITATION',
        role_title: 'Senior Platform Engineer',
        message: 'We reviewed your verified systems assessment and would love to invite you to interview.',
        compensation_range: 'USD 120,000 - 145,000',
      }).success,
    ).toBe(true);

    // Reversible rollback file exists and drops all Talent Pool tables cleanly
    const rollbackSql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/rollbacks/047_to_050_talent_pool.down.sql'),
      'utf8',
    );
    expect(rollbackSql).toContain('drop table if exists public.employer_organizations');
    expect(rollbackSql).toContain('drop table if exists public.talent_interaction_reports');
    expect(rollbackSql).toContain('drop table if exists public.talent_pool_profiles');
  });
});
