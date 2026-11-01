/**
 * Canonical constants, state machines, and consent definitions for
 * Jobiest Talent Pool. Shared across server services, API routes, and UI.
 */

export const TALENT_DISPLAY_STATUSES = [
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
] as const;

export type TalentDisplayStatus = (typeof TALENT_DISPLAY_STATUSES)[number];

export const TALENT_DB_STATUSES = [
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
] as const;

export type TalentApplicationStatus = (typeof TALENT_DB_STATUSES)[number];

export const ACTIVE_APPLICATION_STATUSES: ReadonlySet<TalentApplicationStatus> = new Set([
  'PROFILE_INCOMPLETE',
  'APPLICATION_SUBMITTED',
  'ASSESSMENT_PENDING',
  'INTERVIEW_SCHEDULED',
  'ASSESSMENT_IN_PROGRESS',
  'UNDER_ADMIN_REVIEW',
  'REASSESSMENT_REQUESTED',
  'APPROVED',
]);

export const TALENT_STATUS_META: Record<
  TalentDisplayStatus,
  { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger'; summary: string }
> = {
  NOT_APPLIED: {
    label: 'Not applied',
    tone: 'neutral',
    summary: 'You have not submitted a Talent Pool application yet.',
  },
  PROFILE_INCOMPLETE: {
    label: 'Profile incomplete',
    tone: 'warning',
    summary: 'Complete the missing career details below before submitting your application.',
  },
  APPLICATION_SUBMITTED: {
    label: 'Application submitted',
    tone: 'info',
    summary: 'Your profile snapshot and consents are recorded. Proceed to your assessment when ready.',
  },
  ASSESSMENT_PENDING: {
    label: 'Assessment pending',
    tone: 'info',
    summary: 'Your competency assessment is ready to launch or schedule.',
  },
  INTERVIEW_SCHEDULED: {
    label: 'Interview scheduled',
    tone: 'info',
    summary: 'Your assessment slot is scheduled. You can run a device check or start at your scheduled time.',
  },
  ASSESSMENT_IN_PROGRESS: {
    label: 'Assessment in progress',
    tone: 'warning',
    summary: 'You have an active assessment session that can be resumed from where you paused.',
  },
  UNDER_ADMIN_REVIEW: {
    label: 'Under admin review',
    tone: 'info',
    summary: 'Your completed assessment and profile snapshot are with our human review team.',
  },
  REASSESSMENT_REQUESTED: {
    label: 'Reassessment requested',
    tone: 'warning',
    summary: 'Our review team invited you to complete a fresh assessment session with specific guidance.',
  },
  APPROVED: {
    label: 'Approved',
    tone: 'success',
    summary: 'You are approved in the Jobiest Talent Pool. You control your visibility and employer contact settings.',
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'danger',
    summary: 'Your application was not approved on this review cycle. Review the feedback below for next steps.',
  },
  WITHDRAWN: {
    label: 'Withdrawn',
    tone: 'neutral',
    summary: 'You withdrew from the Talent Pool. Your profile is hidden from all employer searches.',
  },
};

/**
 * Interview session state machine:
 * CREATED -> PRECHECK -> READY -> IN_PROGRESS -> PROCESSING -> COMPLETED -> SUBMITTED_FOR_REVIEW
 * Plus explicit failure, retry, and cancellation states so an interrupted
 * interview never silently becomes a completed assessment.
 */
export const INTERVIEW_SESSION_STATES = [
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
] as const;

export type InterviewSessionState = (typeof INTERVIEW_SESSION_STATES)[number];

const ALLOWED_INTERVIEW_TRANSITIONS: Record<InterviewSessionState, ReadonlySet<InterviewSessionState>> = {
  CREATED: new Set(['PRECHECK', 'READY', 'CANCELLED', 'FAILED']),
  PRECHECK: new Set(['PRECHECK', 'READY', 'FAILED', 'RETRY_PENDING', 'CANCELLED']),
  READY: new Set(['IN_PROGRESS', 'PRECHECK', 'CANCELLED', 'FAILED']),
  IN_PROGRESS: new Set(['IN_PROGRESS', 'PROCESSING', 'FAILED', 'RETRY_PENDING', 'CANCELLED']),
  PROCESSING: new Set(['COMPLETED', 'FAILED', 'RETRY_PENDING']),
  COMPLETED: new Set(['SUBMITTED_FOR_REVIEW', 'FAILED']),
  SUBMITTED_FOR_REVIEW: new Set([]),
  FAILED: new Set(['RETRY_PENDING', 'CANCELLED']),
  RETRY_PENDING: new Set(['PRECHECK', 'READY', 'IN_PROGRESS', 'CANCELLED']),
  CANCELLED: new Set([]),
};

export function canTransitionInterviewState(
  from: InterviewSessionState,
  to: InterviewSessionState,
): boolean {
  return ALLOWED_INTERVIEW_TRANSITIONS[from]?.has(to) ?? false;
}

export function assertInterviewStateTransition(
  from: InterviewSessionState,
  to: InterviewSessionState,
): void {
  if (!canTransitionInterviewState(from, to)) {
    throw new Error(`INVALID_INTERVIEW_STATE_TRANSITION:${from}->${to}`);
  }
}

export const ASSESSMENT_ROUTES = ['VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN'] as const;
export type AssessmentRoute = (typeof ASSESSMENT_ROUTES)[number];

export const CONSENT_VERSION = '2026-11-v1';

export const CONSENT_PURPOSES = [
  'AI_ASSESSMENT',
  'AUDIO_VIDEO_PROCESSING',
  'INTERVIEW_RECORDING',
  'HUMAN_ASSESSMENT_REVIEW',
  'EMPLOYER_DISCOVERY',
  'DATA_RETENTION_WITHDRAWAL',
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export interface ConsentDefinition {
  purpose: ConsentPurpose;
  title: string;
  summary: string;
  requiredForRoutes: readonly AssessmentRoute[];
}

export const CONSENT_DEFINITIONS: readonly ConsentDefinition[] = [
  {
    purpose: 'AI_ASSESSMENT',
    title: '1. AI-assisted competency assessment',
    summary:
      'I consent to Jobiest conducting a structured, role-specific competency interview and generating an evidence-based assessment report. AI never automatically approves or rejects my application.',
    requiredForRoutes: ['VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN'],
  },
  {
    purpose: 'AUDIO_VIDEO_PROCESSING',
    title: '2. Audio and video signal processing',
    summary:
      'Where I choose a voice or video interview, I consent to real-time microphone and camera processing and speech-to-text transcription during active interview sessions.',
    requiredForRoutes: ['VIDEO_VOICE', 'VOICE_ONLY'],
  },
  {
    purpose: 'INTERVIEW_RECORDING',
    title: '3. Secure interview recording for quality and human review',
    summary:
      'Where I choose a voice or video interview, I consent to recording my active session and storing it in encrypted, private storage accessible only to authorized Jobiest reviewers (never shared publicly or shown to employers by default).',
    requiredForRoutes: ['VIDEO_VOICE', 'VOICE_ONLY'],
  },
  {
    purpose: 'HUMAN_ASSESSMENT_REVIEW',
    title: '4. Human administrator assessment review',
    summary:
      'I consent to authorized Jobiest Talent Operations reviewers inspecting my application snapshot, answers, transcript, recording (where applicable), and assessment report to make an audited approval decision.',
    requiredForRoutes: ['VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN'],
  },
  {
    purpose: 'EMPLOYER_DISCOVERY',
    title: '5. Verified employer discovery and approved profile sharing',
    summary:
      'If approved, I consent to verified employers discovering my approved professional profile, competency summary, and preferences inside Jobiest while my visibility is set to Active.',
    requiredForRoutes: ['VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN'],
  },
  {
    purpose: 'DATA_RETENTION_WITHDRAWAL',
    title: '6. Data retention and right to withdraw at any time',
    summary:
      'I understand how my Talent Pool records are retained and that I can pause visibility, restrict CV access, block employer domains, or withdraw from the Talent Pool at any time from my dashboard.',
    requiredForRoutes: ['VIDEO_VOICE', 'VOICE_ONLY', 'ACCESSIBLE_WRITTEN'],
  },
] as const;

export const CAREER_CATEGORIES = [
  'Software Engineering',
  'Data, Analytics & AI',
  'Product Management',
  'Design & UX Research',
  'Cloud, DevOps & Security',
  'Growth, Marketing & Content',
  'Sales, Partnerships & Customer Success',
  'Finance, Operations & Strategy',
  'People, Talent & HR',
  'Project & Program Management',
] as const;

export const SENIORITY_LEVELS = [
  { code: 'ENTRY', label: 'Entry-level (0-1 yrs)' },
  { code: 'JUNIOR', label: 'Junior (1-3 yrs)' },
  { code: 'MID', label: 'Mid-level (3-5 yrs)' },
  { code: 'SENIOR', label: 'Senior (5-8 yrs)' },
  { code: 'STAFF_PRINCIPAL', label: 'Staff / Principal (8+ yrs)' },
  { code: 'LEAD_MANAGER', label: 'Lead / Engineering or Team Manager' },
  { code: 'EXECUTIVE', label: 'Director / VP / Executive' },
] as const;

export const AVAILABILITY_OPTIONS = [
  { code: 'IMMEDIATE', label: 'Immediate' },
  { code: 'TWO_WEEKS', label: '2 weeks notice' },
  { code: 'ONE_MONTH', label: '1 month notice' },
  { code: 'TWO_TO_THREE_MONTHS', label: '2 to 3 months notice' },
  { code: 'OPEN_TO_OFFERS', label: 'Open to strong offers' },
  { code: 'UNAVAILABLE', label: 'Not currently looking' },
] as const;

export const EMPLOYMENT_PREFERENCES = [
  'FULL_TIME',
  'CONTRACT',
  'PART_TIME',
  'FREELANCE',
  'INTERNSHIP',
] as const;

export const REMOTE_PREFERENCES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;

export const SUPPORTED_CURRENCIES = ['USD', 'NGN', 'GBP', 'EUR', 'CAD'] as const;
