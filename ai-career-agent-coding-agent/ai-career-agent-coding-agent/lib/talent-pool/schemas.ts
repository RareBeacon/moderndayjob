import { z } from 'zod';
import { isSafeHttpUrl } from '@/lib/security/safe-url';
import {
  ASSESSMENT_ROUTES,
  AVAILABILITY_OPTIONS,
  CAREER_CATEGORIES,
  CONSENT_PURPOSES,
  SENIORITY_LEVELS,
  SUPPORTED_CURRENCIES,
} from './constants';

const safeOptionalUrl300 = z
  .string()
  .trim()
  .url()
  .max(300)
  .refine((v) => isSafeHttpUrl(v, 300), 'Only http:// and https:// URLs are allowed.')
  .optional()
  .or(z.literal(''));

const safeRequiredUrl300 = z
  .string()
  .trim()
  .url()
  .max(300)
  .refine((v) => isSafeHttpUrl(v, 300), 'Only http:// and https:// URLs are allowed.');

const seniorityCodes = SENIORITY_LEVELS.map((s) => s.code) as [
  (typeof SENIORITY_LEVELS)[number]['code'],
  ...(typeof SENIORITY_LEVELS)[number]['code'][],
];

const availabilityCodes = AVAILABILITY_OPTIONS.map((a) => a.code) as [
  (typeof AVAILABILITY_OPTIONS)[number]['code'],
  ...(typeof AVAILABILITY_OPTIONS)[number]['code'][],
];

export const certificationItemSchema = z.object({
  name: z.string().trim().min(2).max(160),
  issuer: z.string().trim().min(2).max(160),
  year: z.string().trim().max(12).optional(),
  credentialUrl: safeOptionalUrl300,
});

export const experienceItemSchema = z.object({
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1500).optional(),
});

export const educationItemSchema = z.object({
  institution: z.string().trim().min(1).max(160),
  qualification: z.string().trim().min(1).max(160),
});

export const projectItemSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1200).optional(),
  url: safeOptionalUrl300,
});

export const talentIntakeUpdateSchema = z
  .object({
    full_name: z.string().trim().min(2).max(100),
    headline: z.string().trim().min(4).max(160),
    location: z.string().trim().min(2).max(120),
    country: z.string().trim().min(2).max(80),
    time_zone: z.string().trim().min(2).max(80).default('UTC'),
    career_category: z.enum(CAREER_CATEGORIES),
    seniority_level: z.enum(seniorityCodes),
    target_roles: z.array(z.string().trim().min(2).max(80)).min(1).max(6),
    years_of_experience: z.number().min(0).max(60),
    experience: z.array(experienceItemSchema).max(20).default([]),
    education: z.array(educationItemSchema).max(10).default([]),
    projects: z.array(projectItemSchema).max(15).default([]),
    not_applicable: z.array(z.enum(['experience', 'education', 'projects'])).max(3).default([]),
    skills: z.array(z.string().trim().min(1).max(60)).min(2).max(40),
    technical_competencies: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
    certifications: z.array(certificationItemSchema).max(20).default([]),
    relevant_qualifications: z.array(z.string().trim().min(2).max(160)).max(20).default([]),
    portfolio_url: safeOptionalUrl300,
    employment_types: z.array(z.string().trim().min(2).max(40)).min(1).max(6),
    remote_types: z.array(z.enum(['REMOTE', 'HYBRID', 'ONSITE'])).min(1).max(3),
    salary_currency: z.enum(SUPPORTED_CURRENCIES).default('USD'),
    salary_min: z.number().min(0).max(10_000_000).nullable().optional(),
    salary_max: z.number().min(0).max(10_000_000).nullable().optional(),
    availability: z.enum(availabilityCodes),
    work_authorization: z.string().trim().min(2).max(200),
    preferred_assessment_route: z.enum(ASSESSMENT_ROUTES).default('VIDEO_VOICE'),
  })
  .refine(
    (d) => d.salary_min == null || d.salary_max == null || d.salary_max >= d.salary_min,
    { message: 'Maximum salary must be greater than or equal to minimum salary.', path: ['salary_max'] },
  );

export type TalentIntakeUpdateInput = z.infer<typeof talentIntakeUpdateSchema>;

export const consentMapSchema = z.object({
  AI_ASSESSMENT: z.boolean(),
  AUDIO_VIDEO_PROCESSING: z.boolean(),
  INTERVIEW_RECORDING: z.boolean(),
  HUMAN_ASSESSMENT_REVIEW: z.boolean(),
  EMPLOYER_DISCOVERY: z.boolean(),
  DATA_RETENTION_WITHDRAWAL: z.boolean(),
});

export const talentApplicationSubmitSchema = z.object({
  assessment_route: z.enum(ASSESSMENT_ROUTES),
  scheduled_interview_at: z.string().datetime().nullable().optional(),
  allow_cv_access: z.boolean().default(false),
  allow_contact_requests: z.boolean().default(true),
  blocked_employer_domains: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Enter valid domain names like example.com'),
    )
    .max(25)
    .default([]),
  confirmed_information_accurate: z.literal(true),
  consents: consentMapSchema,
});

export type TalentApplicationSubmitInput = z.infer<typeof talentApplicationSubmitSchema>;

export const talentVisibilitySettingsSchema = z.object({
  visibility: z.enum(['ACTIVE', 'PAUSED']).optional(),
  allow_cv_access: z.boolean().optional(),
  allow_contact_requests: z.boolean().optional(),
  blocked_employer_domains: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
    )
    .max(25)
    .optional(),
});

export const talentWithdrawSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  revoke_consents: z.array(z.enum(CONSENT_PURPOSES)).max(6).default(['EMPLOYER_DISCOVERY']),
});

export const createInterviewSessionSchema = z.object({
  application_id: z.guid(),
  mode: z.enum(ASSESSMENT_ROUTES),
});

export const interviewPrecheckSchema = z.object({
  camera_permission: z.enum(['UNCHECKED', 'GRANTED', 'DENIED', 'NOT_APPLICABLE']),
  microphone_permission: z.enum(['UNCHECKED', 'GRANTED', 'DENIED', 'NOT_APPLICABLE']),
  switch_to_accessible_written: z.boolean().optional(),
});

export const interviewAnswerSchema = z.object({
  question_id: z.guid(),
  input_modality: z.enum(['VOICE', 'WRITTEN']),
  answer_transcript: z.string().trim().min(2).max(8000),
  duration_seconds: z.number().int().min(0).max(1800).optional(),
  stt_provider: z.string().trim().max(60).optional(),
  stt_confidence: z.number().min(0).max(1).optional(),
  recording_id: z.guid().nullable().optional(),
});

export const interviewLifecycleActionSchema = z.object({
  action: z.enum(['START', 'HEARTBEAT', 'NETWORK_DROP', 'RETRY', 'CANCEL', 'COMPLETE_AND_SUBMIT']),
  reason: z.string().trim().max(500).optional(),
});

export const adminReviewFilterSchema = z.object({
  status: z.string().trim().max(40).optional(),
  career_category: z.string().trim().max(80).optional(),
  seniority_level: z.string().trim().max(40).optional(),
  interview_state: z.string().trim().max(40).optional(),
  min_score: z.coerce.number().min(0).max(100).optional(),
  max_score: z.coerce.number().min(0).max(100).optional(),
  assigned_reviewer_id: z.guid().optional(),
  submitted_from: z.string().trim().max(32).optional(),
  submitted_to: z.string().trim().max(32).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_REASSESSMENT']),
    reason: z.string().trim().max(1500).optional(),
    candidate_feedback: z.string().trim().max(1500).optional(),
    reassessment_instructions: z.string().trim().max(1500).optional(),
    internal_notes: z.string().trim().max(2000).optional(),
    assign_to_self: z.boolean().default(true),
  })
  .refine(
    (d) =>
      d.decision === 'APPROVE' ||
      (typeof d.reason === 'string' && d.reason.trim().length >= 10),
    {
      message: 'A clear reason (at least 10 characters) is required when rejecting or requesting reassessment.',
      path: ['reason'],
    },
  );

export const employerRegistrationSchema = z.object({
  company_name: z.string().trim().min(2).max(140),
  website_url: safeRequiredUrl300,
  company_description: z.string().trim().min(20).max(2500),
  industry: z.string().trim().min(2).max(100),
  company_location: z.string().trim().min(2).max(140),
  country: z.string().trim().min(2).max(80),
  business_email: z.string().trim().toLowerCase().email().max(254),
  authorized_representative_name: z.string().trim().min(2).max(120),
  authorized_representative_role: z.string().trim().min(2).max(120),
  business_registration_ref: z.string().trim().max(160).optional(),
  supporting_notes: z.string().trim().max(1500).optional(),
});

export const recruiterSearchFilterSchema = z.object({
  title: z.string().trim().max(100).optional(),
  career_category: z.string().trim().max(80).optional(),
  skills: z.string().trim().max(300).optional(),
  min_years_experience: z.coerce.number().min(0).max(60).optional(),
  max_years_experience: z.coerce.number().min(0).max(60).optional(),
  location: z.string().trim().max(100).optional(),
  time_zone: z.string().trim().max(80).optional(),
  salary_currency: z.string().trim().max(6).optional(),
  max_salary_budget: z.coerce.number().min(0).max(10_000_000).optional(),
  availability: z.string().trim().max(40).optional(),
  employment_preference: z.string().trim().max(40).optional(),
  competency: z.string().trim().max(80).optional(),
  min_competency_score: z.coerce.number().min(0).max(100).optional(),
  qualification: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(25).default(12),
});

export const saveCandidateSchema = z.object({
  candidate_user_id: z.guid(),
  note: z.string().trim().max(500).optional(),
});

export const shortlistCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).optional(),
  vacancy_id: z.guid().nullable().optional(),
});

export const shortlistAddCandidateSchema = z.object({
  candidate_user_id: z.guid(),
  note: z.string().trim().max(500).optional(),
});

export const vacancyCreateSchema = z.object({
  title: z.string().trim().min(2).max(140),
  career_category: z.string().trim().max(80).optional(),
  seniority_level: z.string().trim().max(40).optional(),
  location: z.string().trim().max(120).optional(),
  employment_preference: z.string().trim().max(40).optional(),
  salary_currency: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  salary_min: z.number().min(0).max(10_000_000).nullable().optional(),
  salary_max: z.number().min(0).max(10_000_000).nullable().optional(),
  description: z.string().trim().max(3000).optional(),
});

export const pipelineUpdateSchema = z.object({
  candidate_user_id: z.guid(),
  vacancy_id: z.guid().nullable().optional(),
  stage: z.enum([
    'SHORTLISTED',
    'CONTACT_REQUESTED',
    'IN_CONVERSATION',
    'INTERVIEWING',
    'OFFER_EXTENDED',
    'HIRED',
    'ARCHIVED',
  ]),
  notes: z.string().trim().max(1000).optional(),
});

export const contactRequestCreateSchema = z.object({
  candidate_user_id: z.guid(),
  vacancy_id: z.guid().nullable().optional(),
  request_type: z.enum(['CONTACT_REQUEST', 'INTERVIEW_INVITATION']),
  role_title: z.string().trim().min(2).max(140),
  message: z.string().trim().min(20).max(2500),
  proposed_slots: z.array(z.string().trim().min(4).max(120)).max(5).default([]),
  meeting_format: z.string().trim().max(120).optional(),
  compensation_range: z.string().trim().max(120).optional(),
});

export const candidateContactResponseSchema = z.object({
  action: z.enum(['ACCEPT', 'DECLINE']),
  note: z.string().trim().max(1000).optional(),
});

export const conversationMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const interactionReportCreateSchema = z.object({
  organization_id: z.guid().nullable().optional(),
  candidate_user_id: z.guid().nullable().optional(),
  conversation_id: z.guid().nullable().optional(),
  contact_request_id: z.guid().nullable().optional(),
  reason_category: z.enum([
    'SPAM',
    'HARASSMENT',
    'SCAM_OR_FRAUD',
    'OFF_PLATFORM_SOLICITATION',
    'MISREPRESENTATION',
    'OTHER',
  ]),
  details: z.string().trim().min(10).max(2000),
});

export const adminEmployerDecisionSchema = z
  .object({
    decision: z.enum(['VERIFY', 'REJECT', 'SUSPEND']),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine(
    (d) => d.decision === 'VERIFY' || (typeof d.reason === 'string' && d.reason.trim().length >= 8),
    { message: 'Provide a clear reason (at least 8 characters) when rejecting or suspending an employer.', path: ['reason'] },
  );
