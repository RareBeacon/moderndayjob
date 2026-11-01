import { supabaseAdmin } from '@/lib/supabase';
import type { AssessmentRoute } from './constants';

export interface CandidateSnapshotData {
  full_name: string | null;
  headline: string | null;
  summary: string | null;
  email: string | null;
  location: string | null;
  country: string | null;
  time_zone: string | null;
  career_category: string | null;
  seniority_level: string | null;
  target_roles: string[];
  years_of_experience: number | null;
  experience: Array<{ company: string; title: string; description?: string }>;
  education: Array<{ institution: string; qualification: string }>;
  skills: string[];
  technical_competencies: string[];
  certifications: Array<{ name: string; issuer: string; year?: string; credentialUrl?: string }>;
  relevant_qualifications: string[];
  portfolio_url: string | null;
  hosted_portfolio_slug: string | null;
  projects: Array<{ name: string; description?: string; url?: string }>;
  not_applicable: string[];
  employment_types: string[];
  remote_types: string[];
  salary_currency: string;
  salary_min: number | null;
  salary_max: number | null;
  availability: string | null;
  work_authorization: string | null;
  preferred_assessment_route: AssessmentRoute;
  master_cv_present: boolean;
  master_cv_name: string | null;
}

export interface OnboardingFieldCheck {
  key: string;
  label: string;
  required: boolean;
  present: boolean;
  note?: string;
}

export interface OnboardingInspectionResult {
  snapshot: CandidateSnapshotData;
  masterCvDocumentId: string | null;
  portfolioId: string | null;
  fields: OnboardingFieldCheck[];
  missingRequired: OnboardingFieldCheck[];
  missingOptional: OnboardingFieldCheck[];
  completenessScore: number;
  readyToApply: boolean;
}

/**
 * Pure evaluator over real candidate records.
 * Never invents missing information: absent values stay null or [] and are
 * reported transparently so the candidate can fill or confirm them.
 */
export function evaluateCandidateReadiness(input: {
  snapshot: CandidateSnapshotData;
  masterCvDocumentId: string | null;
  portfolioId: string | null;
}): OnboardingInspectionResult {
  const { snapshot, masterCvDocumentId, portfolioId } = input;
  const na = new Set(snapshot.not_applicable ?? []);

  const fields: OnboardingFieldCheck[] = [
    { key: 'full_name', label: 'Full name', required: true, present: Boolean(snapshot.full_name?.trim()) },
    { key: 'headline', label: 'Professional headline', required: true, present: Boolean(snapshot.headline?.trim()) },
    { key: 'email', label: 'Verified email address', required: true, present: Boolean(snapshot.email?.trim()) },
    { key: 'location', label: 'City or region', required: true, present: Boolean(snapshot.location?.trim()) },
    { key: 'country', label: 'Country', required: true, present: Boolean(snapshot.country?.trim()) },
    { key: 'career_category', label: 'Career category', required: true, present: Boolean(snapshot.career_category?.trim()) },
    { key: 'target_roles', label: 'Target job titles', required: true, present: snapshot.target_roles.length > 0 },
    {
      key: 'years_of_experience',
      label: 'Years of experience',
      required: true,
      present: typeof snapshot.years_of_experience === 'number' && snapshot.years_of_experience >= 0,
    },
    {
      key: 'experience',
      label: 'Employment history',
      required: true,
      present: snapshot.experience.length > 0 || na.has('experience'),
      note: na.has('experience') ? 'Marked not applicable (entry-level)' : undefined,
    },
    {
      key: 'education',
      label: 'Education',
      required: true,
      present: snapshot.education.length > 0 || na.has('education'),
      note: na.has('education') ? 'Marked not applicable' : undefined,
    },
    { key: 'skills', label: 'Skills (at least 2)', required: true, present: snapshot.skills.length >= 2 },
    {
      key: 'technical_competencies',
      label: 'Core competencies',
      required: true,
      present: snapshot.technical_competencies.length >= 1,
    },
    {
      key: 'certifications',
      label: 'Certifications',
      required: false,
      present: snapshot.certifications.length > 0,
    },
    {
      key: 'portfolio',
      label: 'Portfolio link or Jobiest portfolio',
      required: false,
      present: Boolean(snapshot.portfolio_url?.trim() || snapshot.hosted_portfolio_slug),
    },
    {
      key: 'projects',
      label: 'Previous projects',
      required: false,
      present: snapshot.projects.length > 0 || na.has('projects'),
    },
    {
      key: 'employment_types',
      label: 'Work preferences (full-time, contract, etc.)',
      required: true,
      present: snapshot.employment_types.length > 0,
    },
    {
      key: 'remote_types',
      label: 'Remote, hybrid, or onsite preferences',
      required: true,
      present: snapshot.remote_types.length > 0,
    },
    {
      key: 'salary_expectations',
      label: 'Salary expectations',
      required: false,
      present: snapshot.salary_min !== null || snapshot.salary_max !== null,
    },
    { key: 'availability', label: 'Availability / notice period', required: true, present: Boolean(snapshot.availability) },
    {
      key: 'work_authorization',
      label: 'Work authorization',
      required: true,
      present: Boolean(snapshot.work_authorization?.trim()),
    },
  ];

  const requiredFields = fields.filter((f) => f.required);
  const completedRequired = requiredFields.filter((f) => f.present).length;
  const missingRequired = requiredFields.filter((f) => !f.present);
  const missingOptional = fields.filter((f) => !f.required && !f.present);
  const completenessScore = Math.round((completedRequired / requiredFields.length) * 100);

  return {
    snapshot,
    masterCvDocumentId,
    portfolioId,
    fields,
    missingRequired,
    missingOptional,
    completenessScore,
    readyToApply: missingRequired.length === 0,
  };
}

/**
 * Server-side profile & onboarding inspector reading live Supabase rows.
 */
export async function inspectCandidateOnboarding(
  userId: string,
  fallbackEmail?: string | null,
): Promise<OnboardingInspectionResult> {
  const [profileRes, careerRes, prefsRes, tpProfileRes, docRes, portfolioRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('full_name,email,target_roles')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('career_profiles')
      .select('headline,summary,skills,experience,education,projects,links,not_applicable')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('job_preferences')
      .select('locations,remote_types,employment_types')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('talent_pool_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('documents')
      .select('id,original_name,kind,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('portfolios')
      .select('id,slug,visibility')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const p = profileRes.data as { full_name?: string | null; email?: string | null; target_roles?: string[] | null } | null;
  const c = careerRes.data as {
    headline?: string | null;
    summary?: string | null;
    skills?: string[] | null;
    experience?: Array<{ company: string; title: string; description?: string }> | null;
    education?: Array<{ institution: string; qualification: string }> | null;
    projects?: Array<{ name?: string; title?: string; description?: string; url?: string }> | null;
    links?: { portfolio?: string } | null;
    not_applicable?: string[] | null;
  } | null;
  const prefs = prefsRes.data as {
    locations?: string[] | null;
    remote_types?: string[] | null;
    employment_types?: string[] | null;
  } | null;
  const tp = tpProfileRes.data as Record<string, unknown> | null;
  const docs = (docRes.data ?? []) as Array<{ id: string; original_name: string; kind: string }>;
  const masterCv = docs.find((d) => d.kind === 'MASTER_CV') ?? docs[0] ?? null;
  const portfolio = portfolioRes.data as { id: string; slug: string; visibility: string } | null;

  const normalizedProjects = Array.isArray(c?.projects)
    ? c!.projects
        .map((proj) => ({
          name: String(proj.name ?? proj.title ?? '').trim(),
          description: proj.description ? String(proj.description) : undefined,
          url: proj.url ? String(proj.url) : undefined,
        }))
        .filter((proj) => proj.name.length > 0)
    : [];

  const snapshot: CandidateSnapshotData = {
    full_name: p?.full_name ?? null,
    headline: c?.headline ?? null,
    summary: c?.summary ?? null,
    email: p?.email ?? fallbackEmail ?? null,
    location:
      (typeof tp?.location === 'string' && tp.location.trim()) ||
      (Array.isArray(prefs?.locations) && prefs!.locations[0] ? String(prefs!.locations[0]) : null),
    country: typeof tp?.country === 'string' && tp.country.trim() ? tp.country : null,
    time_zone: typeof tp?.time_zone === 'string' && tp.time_zone.trim() ? tp.time_zone : null,
    career_category: typeof tp?.career_category === 'string' ? tp.career_category : null,
    seniority_level: typeof tp?.seniority_level === 'string' ? tp.seniority_level : null,
    target_roles: Array.isArray(p?.target_roles) ? p!.target_roles : [],
    years_of_experience:
      tp?.years_of_experience !== null && tp?.years_of_experience !== undefined
        ? Number(tp.years_of_experience)
        : null,
    experience: Array.isArray(c?.experience) ? c!.experience : [],
    education: Array.isArray(c?.education) ? c!.education : [],
    skills: Array.isArray(c?.skills) ? c!.skills : [],
    technical_competencies: Array.isArray(tp?.technical_competencies)
      ? (tp!.technical_competencies as string[])
      : [],
    certifications: Array.isArray(tp?.certifications)
      ? (tp!.certifications as Array<{ name: string; issuer: string; year?: string; credentialUrl?: string }>)
      : [],
    relevant_qualifications: Array.isArray(tp?.relevant_qualifications)
      ? (tp!.relevant_qualifications as string[])
      : [],
    portfolio_url: c?.links?.portfolio ? String(c.links.portfolio) : null,
    hosted_portfolio_slug: portfolio?.slug ?? null,
    projects: normalizedProjects,
    not_applicable: Array.isArray(c?.not_applicable) ? c!.not_applicable : [],
    employment_types: Array.isArray(prefs?.employment_types) ? prefs!.employment_types : [],
    remote_types: Array.isArray(prefs?.remote_types)
      ? prefs!.remote_types.map((r) => String(r).toUpperCase())
      : [],
    salary_currency: typeof tp?.salary_currency === 'string' ? tp.salary_currency : 'USD',
    salary_min: tp?.salary_min !== null && tp?.salary_min !== undefined ? Number(tp.salary_min) : null,
    salary_max: tp?.salary_max !== null && tp?.salary_max !== undefined ? Number(tp.salary_max) : null,
    availability: typeof tp?.availability === 'string' ? tp.availability : null,
    work_authorization: typeof tp?.work_authorization === 'string' ? tp.work_authorization : null,
    preferred_assessment_route:
      tp?.preferred_assessment_route === 'VOICE_ONLY' || tp?.preferred_assessment_route === 'ACCESSIBLE_WRITTEN'
        ? tp.preferred_assessment_route
        : 'VIDEO_VOICE',
    master_cv_present: Boolean(masterCv),
    master_cv_name: masterCv?.original_name ?? null,
  };

  return evaluateCandidateReadiness({
    snapshot,
    masterCvDocumentId: masterCv?.id ?? null,
    portfolioId: portfolio?.id ?? null,
  });
}
