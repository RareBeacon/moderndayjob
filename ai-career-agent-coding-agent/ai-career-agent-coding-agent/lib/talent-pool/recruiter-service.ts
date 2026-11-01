import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent, requireAuditEvent } from '@/lib/audit';
import { notifyUser } from '@/lib/notifications/dispatch';
import { defangUntrustedText } from '@/lib/ai/injection';
import type { z } from 'zod';
import {
  candidateContactResponseSchema,
  contactRequestCreateSchema,
  conversationMessageSchema,
  employerRegistrationSchema,
  interactionReportCreateSchema,
  pipelineUpdateSchema,
  recruiterSearchFilterSchema,
  saveCandidateSchema,
  shortlistAddCandidateSchema,
  shortlistCreateSchema,
  vacancyCreateSchema,
} from './schemas';
import { TalentPoolError } from './candidate-service';

export interface EmployerContext {
  organization: {
    id: string;
    slug: string;
    company_name: string;
    website_url: string;
    company_description: string;
    industry: string;
    company_location: string;
    country: string | null;
    business_email: string;
    business_email_domain: string;
    authorized_representative_name: string;
    authorized_representative_role: string | null;
    verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
    rejection_reason: string | null;
  };
  membership: {
    id: string;
    role: 'OWNER' | 'ADMIN' | 'RECRUITER';
    status: string;
  };
}

function slugifyCompany(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'company'}-${suffix}`;
}

export async function getEmployerContextForUser(userId: string): Promise<EmployerContext | null> {
  const { data: member } = await supabaseAdmin
    .from('employer_members')
    .select('id,organization_id,role,status')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!member) return null;
  const m = member as { id: string; organization_id: string; role: 'OWNER' | 'ADMIN' | 'RECRUITER'; status: string };

  const { data: org } = await supabaseAdmin
    .from('employer_organizations')
    .select('*')
    .eq('id', m.organization_id)
    .maybeSingle();

  if (!org) return null;
  return {
    organization: org as EmployerContext['organization'],
    membership: { id: m.id, role: m.role, status: m.status },
  };
}

export async function requireVerifiedEmployer(userId: string): Promise<EmployerContext> {
  const ctx = await getEmployerContextForUser(userId);
  if (!ctx) {
    throw new TalentPoolError('EMPLOYER_MEMBERSHIP_REQUIRED', 'Register an employer organization first.', 403);
  }
  if (ctx.organization.verification_status !== 'VERIFIED') {
    throw new TalentPoolError(
      'EMPLOYER_VERIFICATION_REQUIRED',
      `Your organization (${ctx.organization.company_name}) is currently ${ctx.organization.verification_status}. Candidate search unlocks once a Jobiest administrator verifies your organization.`,
      403,
    );
  }
  return ctx;
}

export async function registerEmployerOrganization(
  userId: string,
  input: z.infer<typeof employerRegistrationSchema>,
): Promise<EmployerContext> {
  const existing = await getEmployerContextForUser(userId);
  if (existing) {
    throw new TalentPoolError(
      'EMPLOYER_ALREADY_REGISTERED',
      `You are already an active member of ${existing.organization.company_name}.`,
      409,
    );
  }

  const emailDomain = input.business_email.split('@')[1]?.toLowerCase() ?? '';
  let webHost = '';
  try {
    webHost = new URL(input.website_url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {}
  const domainMatched = Boolean(emailDomain && webHost && (emailDomain === webHost || emailDomain.endsWith(`.${webHost}`)));
  const nowIso = new Date().toISOString();

  const { data: org, error: orgErr } = await supabaseAdmin
    .from('employer_organizations')
    .insert({
      slug: slugifyCompany(input.company_name),
      company_name: input.company_name,
      website_url: input.website_url,
      company_description: input.company_description,
      industry: input.industry,
      company_location: input.company_location,
      country: input.country,
      business_email: input.business_email,
      business_email_domain: emailDomain,
      authorized_representative_name: input.authorized_representative_name,
      authorized_representative_role: input.authorized_representative_role,
      verification_status: 'PENDING',
      created_by: userId,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (orgErr || !org) {
    throw new TalentPoolError('EMPLOYER_CREATE_FAILED', 'Unable to register employer organization.', 500);
  }
  const orgRow = org as EmployerContext['organization'];

  const { data: memberRow, error: memErr } = await supabaseAdmin
    .from('employer_members')
    .insert({
      organization_id: orgRow.id,
      user_id: userId,
      role: 'OWNER',
      status: 'ACTIVE',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id,role,status')
    .single();

  if (memErr || !memberRow) {
    throw new TalentPoolError('EMPLOYER_MEMBER_CREATE_FAILED', 'Unable to assign organization owner.', 500);
  }

  await supabaseAdmin.from('employer_verifications').insert({
    organization_id: orgRow.id,
    submitted_by: userId,
    business_registration_ref: input.business_registration_ref ?? null,
    corporate_domain_matched: domainMatched,
    supporting_notes: input.supporting_notes ?? null,
    status: 'SUBMITTED',
    created_at: nowIso,
  });

  await auditEvent({
    action: 'EMPLOYER_ORGANIZATION_REGISTERED',
    resource: 'employer_organizations',
    resourceId: orgRow.id,
    userId,
    outcome: 'allow',
    meta: { domain_matched: domainMatched, industry: input.industry },
  });

  return {
    organization: orgRow,
    membership: memberRow as EmployerContext['membership'],
  };
}

export interface RecruiterCandidateCardDTO {
  candidate_user_id: string;
  display_name: string;
  headline: string | null;
  target_roles: string[];
  career_category: string | null;
  seniority_level: string | null;
  years_of_experience: number | null;
  location: string | null;
  country: string | null;
  time_zone: string | null;
  skills: string[];
  technical_competencies: string[];
  relevant_qualifications: string[];
  availability: string | null;
  employment_types: string[];
  remote_types: string[];
  salary_currency: string;
  salary_min: number | null;
  salary_max: number | null;
  overall_score: number | null;
  recruiter_summary: string | null;
  competency_scores: Array<{ key: string; label: string; score: number }>;
  allow_cv_access: boolean;
  allow_contact_requests: boolean;
  saved: boolean;
}

function maskDisplayName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Verified Candidate';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Server-side filtered & paginated candidate discovery.
 * HARD SECURITY INVARIANT:
 *   1. Caller must belong to a VERIFIED employer organization.
 *   2. Candidate application MUST have status = 'APPROVED'.
 *   3. Candidate talent_pool_profiles MUST have visibility = 'ACTIVE'.
 *   4. Candidate profiles MUST have account_status = 'ACTIVE'.
 *   5. Candidate EMPLOYER_DISCOVERY consent MUST be granted and not withdrawn.
 *   6. Employer domain MUST NOT appear in candidate's blocked_employer_domains.
 */
export async function searchApprovedTalentCandidates(
  recruiterUserId: string,
  filters: z.infer<typeof recruiterSearchFilterSchema>,
) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  const employerDomain = employer.organization.business_email_domain.toLowerCase();

  // Step 1: Query ONLY APPROVED applications at DB level.
  let appQuery = supabaseAdmin
    .from('talent_applications')
    .select('id,user_id,career_category,seniority_level,latest_score,decided_at')
    .eq('status', 'APPROVED')
    .order('decided_at', { ascending: false });

  if (filters.career_category) {
    appQuery = appQuery.eq('career_category', filters.career_category);
  }

  const { data: approvedApps, error: appErr } = await appQuery.limit(500);
  if (appErr) {
    throw new TalentPoolError('CANDIDATE_SEARCH_FAILED', 'Unable to search Talent Pool.', 500);
  }

  const apps = (approvedApps ?? []) as Array<{
    id: string;
    user_id: string;
    career_category: string | null;
    seniority_level: string | null;
    latest_score: number | null;
  }>;

  if (apps.length === 0) {
    return { items: [] as RecruiterCandidateCardDTO[], total: 0, page: filters.page, page_size: filters.page_size };
  }

  const candidateIds = Array.from(new Set(apps.map((a) => a.user_id)));
  const appIds = apps.map((a) => a.id);

  const [tpProfilesRes, profilesRes, careersRes, prefsRes, consentsRes, reportsRes, dimsRes, savedRes] =
    await Promise.all([
      supabaseAdmin
        .from('talent_pool_profiles')
        .select('*')
        .in('user_id', candidateIds)
        .eq('visibility', 'ACTIVE'),
      supabaseAdmin
        .from('profiles')
        .select('user_id,full_name,target_roles,account_status')
        .in('user_id', candidateIds)
        .eq('account_status', 'ACTIVE'),
      supabaseAdmin
        .from('career_profiles')
        .select('user_id,headline,skills')
        .in('user_id', candidateIds),
      supabaseAdmin
        .from('job_preferences')
        .select('user_id,employment_types,remote_types')
        .in('user_id', candidateIds),
      supabaseAdmin
        .from('talent_consents')
        .select('user_id,granted,withdrawn_at,created_at')
        .in('user_id', candidateIds)
        .eq('purpose', 'EMPLOYER_DISCOVERY')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('talent_assessment_reports')
        .select('application_id,overall_score,recruiter_summary')
        .in('application_id', appIds)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('talent_assessment_dimensions')
        .select('application_id,dimension_key,dimension_label,score,employer_visible')
        .in('application_id', appIds)
        .eq('employer_visible', true),
      supabaseAdmin
        .from('employer_saved_candidates')
        .select('candidate_user_id')
        .eq('organization_id', employer.organization.id),
    ]);

  const tpMap = new Map<string, Record<string, unknown>>();
  for (const row of (tpProfilesRes.data ?? []) as Array<Record<string, unknown>>) {
    tpMap.set(String(row.user_id), row);
  }

  const profMap = new Map<string, { full_name: string | null; target_roles: string[] }>();
  for (const row of (profilesRes.data ?? []) as Array<{ user_id: string; full_name: string | null; target_roles: string[] | null }>) {
    profMap.set(row.user_id, { full_name: row.full_name, target_roles: row.target_roles ?? [] });
  }

  const careerMap = new Map<string, { headline: string | null; skills: string[] }>();
  for (const row of (careersRes.data ?? []) as Array<{ user_id: string; headline: string | null; skills: string[] | null }>) {
    careerMap.set(row.user_id, { headline: row.headline, skills: row.skills ?? [] });
  }

  const prefsMap = new Map<string, { employment_types: string[]; remote_types: string[] }>();
  for (const row of (prefsRes.data ?? []) as Array<{ user_id: string; employment_types: string[] | null; remote_types: string[] | null }>) {
    prefsMap.set(row.user_id, {
      employment_types: row.employment_types ?? [],
      remote_types: row.remote_types ?? [],
    });
  }

  const discoveryConsentAllowed = new Map<string, boolean>();
  for (const row of (consentsRes.data ?? []) as Array<{ user_id: string; granted: boolean; withdrawn_at: string | null }>) {
    if (!discoveryConsentAllowed.has(row.user_id)) {
      discoveryConsentAllowed.set(row.user_id, Boolean(row.granted && !row.withdrawn_at));
    }
  }

  const reportMap = new Map<string, { overall_score: number; recruiter_summary: string }>();
  for (const r of (reportsRes.data ?? []) as Array<{ application_id: string; overall_score: number; recruiter_summary: string }>) {
    if (!reportMap.has(r.application_id)) {
      reportMap.set(r.application_id, {
        overall_score: Number(r.overall_score),
        recruiter_summary: r.recruiter_summary,
      });
    }
  }

  const dimsMap = new Map<string, Array<{ key: string; label: string; score: number }>>();
  for (const d of (dimsRes.data ?? []) as Array<{ application_id: string; dimension_key: string; dimension_label: string; score: number }>) {
    const arr = dimsMap.get(d.application_id) ?? [];
    arr.push({ key: d.dimension_key, label: d.dimension_label, score: Number(d.score) });
    dimsMap.set(d.application_id, arr);
  }

  const savedSet = new Set(
    ((savedRes.data ?? []) as Array<{ candidate_user_id: string }>).map((s) => s.candidate_user_id),
  );

  const skillTokens = filters.skills
    ? filters.skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const titleToken = filters.title?.toLowerCase();
  const locToken = filters.location?.toLowerCase();
  const tzToken = filters.time_zone?.toLowerCase();
  const qualToken = filters.qualification?.toLowerCase();
  const compToken = filters.competency?.toLowerCase();

  const matched: RecruiterCandidateCardDTO[] = [];
  const seenUsers = new Set<string>();

  for (const app of apps) {
    if (seenUsers.has(app.user_id)) continue;
    const tp = tpMap.get(app.user_id);
    const prof = profMap.get(app.user_id);
    if (!tp || !prof) continue;
    if (!discoveryConsentAllowed.get(app.user_id)) continue;

    const blocked = Array.isArray(tp.blocked_employer_domains)
      ? (tp.blocked_employer_domains as string[]).map((d) => d.toLowerCase())
      : [];
    if (employerDomain && blocked.includes(employerDomain)) continue;

    const career = careerMap.get(app.user_id) ?? { headline: null, skills: [] };
    const prefs = prefsMap.get(app.user_id) ?? { employment_types: [], remote_types: [] };
    const rep = reportMap.get(app.id);
    const dims = dimsMap.get(app.id) ?? [];

    const yoe = tp.years_of_experience !== null && tp.years_of_experience !== undefined ? Number(tp.years_of_experience) : null;
    const competencies = Array.isArray(tp.technical_competencies) ? (tp.technical_competencies as string[]) : [];
    const qualifications = Array.isArray(tp.relevant_qualifications) ? (tp.relevant_qualifications as string[]) : [];
    const salaryMin = tp.salary_min !== null && tp.salary_min !== undefined ? Number(tp.salary_min) : null;
    const salaryMax = tp.salary_max !== null && tp.salary_max !== undefined ? Number(tp.salary_max) : null;

    // Apply all 11 filter dimensions server-side.
    if (titleToken) {
      const titleCorpus = [career.headline ?? '', ...prof.target_roles].join(' ').toLowerCase();
      if (!titleCorpus.includes(titleToken)) continue;
    }
    if (skillTokens.length > 0) {
      const candidateSkillsLower = [...career.skills, ...competencies].map((s) => s.toLowerCase());
      const allFound = skillTokens.every((tok) => candidateSkillsLower.some((cs) => cs.includes(tok)));
      if (!allFound) continue;
    }
    if (filters.min_years_experience !== undefined && (yoe === null || yoe < filters.min_years_experience)) continue;
    if (filters.max_years_experience !== undefined && (yoe === null || yoe > filters.max_years_experience)) continue;
    if (locToken) {
      const locCorpus = `${String(tp.location ?? '')} ${String(tp.country ?? '')}`.toLowerCase();
      if (!locCorpus.includes(locToken)) continue;
    }
    if (tzToken && !String(tp.time_zone ?? '').toLowerCase().includes(tzToken)) continue;
    if (filters.availability && String(tp.availability ?? '') !== filters.availability) continue;
    if (filters.employment_preference) {
      const prefUpper = filters.employment_preference.toUpperCase();
      const allPrefs = [...prefs.employment_types, ...prefs.remote_types].map((x) => x.toUpperCase());
      if (!allPrefs.includes(prefUpper)) continue;
    }
    if (filters.max_salary_budget !== undefined && salaryMin !== null) {
      if (!filters.salary_currency || String(tp.salary_currency ?? 'USD') === filters.salary_currency) {
        if (salaryMin > filters.max_salary_budget) continue;
      }
    }
    if (compToken) {
      const matchingDim = dims.find(
        (d) => d.key.toLowerCase().includes(compToken) || d.label.toLowerCase().includes(compToken),
      );
      const matchingTextComp = competencies.some((c) => c.toLowerCase().includes(compToken));
      if (!matchingDim && !matchingTextComp) continue;
      if (filters.min_competency_score !== undefined && matchingDim && matchingDim.score < filters.min_competency_score) {
        continue;
      }
    } else if (filters.min_competency_score !== undefined) {
      const overall = rep?.overall_score ?? app.latest_score ?? 0;
      if (Number(overall) < filters.min_competency_score) continue;
    }
    if (qualToken) {
      const qualCorpus = qualifications.join(' ').toLowerCase();
      if (!qualCorpus.includes(qualToken)) continue;
    }

    seenUsers.add(app.user_id);
    matched.push({
      candidate_user_id: app.user_id,
      display_name: maskDisplayName(prof.full_name),
      headline: career.headline,
      target_roles: prof.target_roles,
      career_category: (tp.career_category as string | null) ?? app.career_category,
      seniority_level: (tp.seniority_level as string | null) ?? app.seniority_level,
      years_of_experience: yoe,
      location: (tp.location as string | null) ?? null,
      country: (tp.country as string | null) ?? null,
      time_zone: (tp.time_zone as string | null) ?? null,
      skills: career.skills.slice(0, 20),
      technical_competencies: competencies.slice(0, 15),
      relevant_qualifications: qualifications.slice(0, 10),
      availability: (tp.availability as string | null) ?? null,
      employment_types: prefs.employment_types,
      remote_types: prefs.remote_types,
      salary_currency: String(tp.salary_currency ?? 'USD'),
      salary_min: salaryMin,
      salary_max: salaryMax,
      overall_score: rep?.overall_score ?? (app.latest_score !== null ? Number(app.latest_score) : null),
      recruiter_summary: rep?.recruiter_summary ?? null,
      competency_scores: dims,
      allow_cv_access: Boolean(tp.allow_cv_access),
      allow_contact_requests: tp.allow_contact_requests !== false,
      saved: savedSet.has(app.user_id),
    });
  }

  const total = matched.length;
  const start = (filters.page - 1) * filters.page_size;
  const paginated = matched.slice(start, start + filters.page_size);

  return {
    items: paginated,
    total,
    page: filters.page,
    page_size: filters.page_size,
  };
}

export async function getAuthorizedCandidateDetailForEmployer(
  recruiterUserId: string,
  candidateUserId: string,
) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  const employerDomain = employer.organization.business_email_domain.toLowerCase();

  const [appRes, tpRes, profRes, careerRes, prefsRes, consentRes, portfolioRes, acceptedReqRes, savedRes] =
    await Promise.all([
      supabaseAdmin
        .from('talent_applications')
        .select('id,status,career_category,seniority_level,latest_score')
        .eq('user_id', candidateUserId)
        .eq('status', 'APPROVED')
        .order('decided_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('talent_pool_profiles')
        .select('*')
        .eq('user_id', candidateUserId)
        .eq('visibility', 'ACTIVE')
        .maybeSingle(),
      supabaseAdmin
        .from('profiles')
        .select('user_id,full_name,target_roles,account_status')
        .eq('user_id', candidateUserId)
        .eq('account_status', 'ACTIVE')
        .maybeSingle(),
      supabaseAdmin
        .from('career_profiles')
        .select('headline,summary,skills,experience,education,projects,links')
        .eq('user_id', candidateUserId)
        .maybeSingle(),
      supabaseAdmin
        .from('job_preferences')
        .select('employment_types,remote_types')
        .eq('user_id', candidateUserId)
        .maybeSingle(),
      supabaseAdmin
        .from('talent_consents')
        .select('granted,withdrawn_at')
        .eq('user_id', candidateUserId)
        .eq('purpose', 'EMPLOYER_DISCOVERY')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('portfolios')
        .select('slug,visibility')
        .eq('user_id', candidateUserId)
        .in('visibility', ['PUBLIC', 'UNLISTED'])
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('talent_contact_requests')
        .select('id,status')
        .eq('organization_id', employer.organization.id)
        .eq('candidate_user_id', candidateUserId)
        .eq('status', 'ACCEPTED')
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('employer_saved_candidates')
        .select('id')
        .eq('organization_id', employer.organization.id)
        .eq('candidate_user_id', candidateUserId)
        .maybeSingle(),
    ]);

  if (!appRes.data || !tpRes.data || !profRes.data) {
    throw new TalentPoolError('CANDIDATE_NOT_AVAILABLE', 'Candidate profile is not available.', 404);
  }
  const consent = consentRes.data as { granted?: boolean; withdrawn_at?: string | null } | null;
  if (!consent?.granted || consent.withdrawn_at) {
    throw new TalentPoolError('CANDIDATE_NOT_AVAILABLE', 'Candidate profile is not available.', 404);
  }

  const tp = tpRes.data as Record<string, unknown>;
  const blocked = Array.isArray(tp.blocked_employer_domains)
    ? (tp.blocked_employer_domains as string[]).map((d) => d.toLowerCase())
    : [];
  if (employerDomain && blocked.includes(employerDomain)) {
    throw new TalentPoolError('CANDIDATE_NOT_AVAILABLE', 'Candidate profile is not available.', 404);
  }

  const app = appRes.data as { id: string; career_category: string | null; seniority_level: string | null; latest_score: number | null };
  const prof = profRes.data as { full_name: string | null; target_roles: string[] | null };
  const career = (careerRes.data ?? {}) as {
    headline?: string | null;
    summary?: string | null;
    skills?: string[] | null;
    experience?: unknown[] | null;
    education?: unknown[] | null;
    projects?: unknown[] | null;
    links?: { portfolio?: string } | null;
  };
  const prefs = (prefsRes.data ?? {}) as { employment_types?: string[] | null; remote_types?: string[] | null };

  const [reportRes, dimsRes, docCountRes] = await Promise.all([
    supabaseAdmin
      .from('talent_assessment_reports')
      .select('overall_score,calibrated_level,recruiter_summary,strengths')
      .eq('application_id', app.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('talent_assessment_dimensions')
      .select('dimension_key,dimension_label,score,rationale')
      .eq('application_id', app.id)
      .eq('employer_visible', true),
    supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', candidateUserId),
  ]);

  const contactAccepted = Boolean(acceptedReqRes.data);
  const cvPermitted = Boolean(tp.allow_cv_access || contactAccepted) && (docCountRes.count ?? 0) > 0;

  await auditEvent({
    action: 'EMPLOYER_CANDIDATE_PROFILE_VIEWED',
    resource: 'talent_pool_profiles',
    resourceId: candidateUserId,
    userId: recruiterUserId,
    outcome: 'allow',
    meta: { organization_id: employer.organization.id },
  });

  // Never include raw recordings, private transcripts, confidential admin notes, or unauthorized direct PII.
  return {
    candidate_user_id: candidateUserId,
    display_name: contactAccepted ? prof.full_name ?? 'Verified Candidate' : maskDisplayName(prof.full_name),
    headline: career.headline ?? null,
    summary: career.summary ?? null,
    target_roles: prof.target_roles ?? [],
    career_category: (tp.career_category as string | null) ?? app.career_category,
    seniority_level: (tp.seniority_level as string | null) ?? app.seniority_level,
    years_of_experience: tp.years_of_experience !== null ? Number(tp.years_of_experience) : null,
    location: (tp.location as string | null) ?? null,
    country: (tp.country as string | null) ?? null,
    time_zone: (tp.time_zone as string | null) ?? null,
    work_authorization: (tp.work_authorization as string | null) ?? null,
    skills: career.skills ?? [],
    technical_competencies: Array.isArray(tp.technical_competencies) ? tp.technical_competencies : [],
    certifications: Array.isArray(tp.certifications) ? tp.certifications : [],
    relevant_qualifications: Array.isArray(tp.relevant_qualifications) ? tp.relevant_qualifications : [],
    experience: career.experience ?? [],
    education: career.education ?? [],
    projects: career.projects ?? [],
    portfolio_url: career.links?.portfolio || null,
    hosted_portfolio_slug: (portfolioRes.data as { slug?: string } | null)?.slug ?? null,
    availability: (tp.availability as string | null) ?? null,
    employment_types: prefs.employment_types ?? [],
    remote_types: prefs.remote_types ?? [],
    salary_currency: String(tp.salary_currency ?? 'USD'),
    salary_min: tp.salary_min !== null && tp.salary_min !== undefined ? Number(tp.salary_min) : null,
    salary_max: tp.salary_max !== null && tp.salary_max !== undefined ? Number(tp.salary_max) : null,
    assessment: reportRes.data
      ? {
          overall_score: Number((reportRes.data as { overall_score: number }).overall_score),
          calibrated_level: (reportRes.data as { calibrated_level: string }).calibrated_level,
          recruiter_summary: (reportRes.data as { recruiter_summary: string }).recruiter_summary,
          strengths: (reportRes.data as { strengths: string[] }).strengths ?? [],
          competency_scores: (dimsRes.data ?? []) as Array<{
            dimension_key: string;
            dimension_label: string;
            score: number;
            rationale: string;
          }>,
        }
      : null,
    cv_permitted: cvPermitted,
    allow_contact_requests: tp.allow_contact_requests !== false,
    saved: Boolean(savedRes.data),
  };
}

export async function getAuthorizedCandidateCvSignedUrl(
  recruiterUserId: string,
  candidateUserId: string,
) {
  const detail = await getAuthorizedCandidateDetailForEmployer(recruiterUserId, candidateUserId);
  if (!detail.cv_permitted) {
    throw new TalentPoolError(
      'CV_PERMISSION_REQUIRED',
      'This candidate restricts CV downloads until they accept a contact request or enable CV access.',
      403,
    );
  }

  const { data: docs } = await supabaseAdmin
    .from('documents')
    .select('id,storage_path,original_name,kind')
    .eq('user_id', candidateUserId)
    .order('created_at', { ascending: false })
    .limit(5);

  const list = (docs ?? []) as Array<{ id: string; storage_path: string; original_name: string; kind: string }>;
  const master = list.find((d) => d.kind === 'MASTER_CV') ?? list[0];
  if (!master) {
    throw new TalentPoolError('CV_NOT_FOUND', 'Candidate has not uploaded a CV file.', 404);
  }

  await requireAuditEvent({
    action: 'EMPLOYER_CANDIDATE_CV_DOWNLOADED',
    resource: 'documents',
    resourceId: master.id,
    userId: recruiterUserId,
    outcome: 'allow',
    meta: { candidate_user_id: candidateUserId },
  });

  const { data: signed, error } = await supabaseAdmin.storage
    .from('career-documents')
    .createSignedUrl(master.storage_path, 60);

  if (error || !signed?.signedUrl) {
    throw new TalentPoolError('CV_SIGNED_URL_FAILED', 'Unable to issue signed CV download link.', 500);
  }
  return { signedUrl: signed.signedUrl, filename: master.original_name };
}

export async function saveCandidateForEmployer(
  recruiterUserId: string,
  input: z.infer<typeof saveCandidateSchema>,
) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  // Ensure candidate is actually discoverable before allowing save (blocks enumeration).
  await getAuthorizedCandidateDetailForEmployer(recruiterUserId, input.candidate_user_id);

  await supabaseAdmin.from('employer_saved_candidates').upsert(
    {
      organization_id: employer.organization.id,
      saved_by: recruiterUserId,
      candidate_user_id: input.candidate_user_id,
      note: input.note ?? null,
    },
    { onConflict: 'organization_id,candidate_user_id' },
  );
  return { ok: true };
}

export async function removeSavedCandidateForEmployer(recruiterUserId: string, candidateUserId: string) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  await supabaseAdmin
    .from('employer_saved_candidates')
    .delete()
    .eq('organization_id', employer.organization.id)
    .eq('candidate_user_id', candidateUserId);
  return { ok: true };
}

export async function createEmployerShortlist(
  recruiterUserId: string,
  input: z.infer<typeof shortlistCreateSchema>,
) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  const { data, error } = await supabaseAdmin
    .from('employer_shortlists')
    .insert({
      organization_id: employer.organization.id,
      created_by: recruiterUserId,
      name: input.name,
      description: input.description ?? null,
      vacancy_id: input.vacancy_id ?? null,
    })
    .select('*')
    .single();
  if (error || !data) throw new TalentPoolError('SHORTLIST_CREATE_FAILED', 'Could not create shortlist.', 500);
  return data;
}

export async function addCandidateToShortlist(
  recruiterUserId: string,
  shortlistId: string,
  input: z.infer<typeof shortlistAddCandidateSchema>,
) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  const { data: sl } = await supabaseAdmin
    .from('employer_shortlists')
    .select('id,organization_id')
    .eq('id', shortlistId)
    .eq('organization_id', employer.organization.id)
    .maybeSingle();

  if (!sl) throw new TalentPoolError('SHORTLIST_NOT_FOUND', 'Shortlist not found in your organization.', 404);
  await getAuthorizedCandidateDetailForEmployer(recruiterUserId, input.candidate_user_id);

  await supabaseAdmin.from('employer_shortlist_candidates').upsert(
    {
      shortlist_id: shortlistId,
      organization_id: employer.organization.id,
      candidate_user_id: input.candidate_user_id,
      added_by: recruiterUserId,
      note: input.note ?? null,
    },
    { onConflict: 'shortlist_id,candidate_user_id' },
  );
  return { ok: true };
}

export async function createEmployerVacancy(
  recruiterUserId: string,
  input: z.infer<typeof vacancyCreateSchema>,
) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  const { data, error } = await supabaseAdmin
    .from('recruitment_vacancies')
    .insert({
      organization_id: employer.organization.id,
      created_by: recruiterUserId,
      title: input.title,
      career_category: input.career_category ?? null,
      seniority_level: input.seniority_level ?? null,
      location: input.location ?? null,
      employment_preference: input.employment_preference ?? null,
      salary_currency: input.salary_currency,
      salary_min: input.salary_min ?? null,
      salary_max: input.salary_max ?? null,
      description: input.description ?? null,
      status: 'OPEN',
    })
    .select('*')
    .single();

  if (error || !data) throw new TalentPoolError('VACANCY_CREATE_FAILED', 'Could not create vacancy.', 500);
  return data;
}

export async function updateEmployerPipelineStage(
  recruiterUserId: string,
  input: z.infer<typeof pipelineUpdateSchema>,
) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  await getAuthorizedCandidateDetailForEmployer(recruiterUserId, input.candidate_user_id);
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('recruitment_pipeline_entries')
    .select('id')
    .eq('organization_id', employer.organization.id)
    .eq('candidate_user_id', input.candidate_user_id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('recruitment_pipeline_entries')
      .update({
        stage: input.stage,
        vacancy_id: input.vacancy_id ?? null,
        notes: input.notes ?? null,
        updated_by: recruiterUserId,
        updated_at: nowIso,
      })
      .eq('id', (existing as { id: string }).id);
  } else {
    await supabaseAdmin.from('recruitment_pipeline_entries').insert({
      organization_id: employer.organization.id,
      vacancy_id: input.vacancy_id ?? null,
      candidate_user_id: input.candidate_user_id,
      stage: input.stage,
      notes: input.notes ?? null,
      updated_by: recruiterUserId,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  if (input.stage === 'HIRED') {
    await supabaseAdmin.from('talent_placements').insert({
      organization_id: employer.organization.id,
      vacancy_id: input.vacancy_id ?? null,
      candidate_user_id: input.candidate_user_id,
      role_title: 'Placed via Jobiest Talent Pool',
      recorded_by: recruiterUserId,
      status: 'OFFER_ACCEPTED',
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  return { ok: true };
}

export async function sendEmployerContactRequest(
  recruiterUserId: string,
  input: z.infer<typeof contactRequestCreateSchema>,
) {
  const employer = await requireVerifiedEmployer(recruiterUserId);
  const candidate = await getAuthorizedCandidateDetailForEmployer(recruiterUserId, input.candidate_user_id);

  if (!candidate.allow_contact_requests) {
    throw new TalentPoolError(
      'CANDIDATE_NOT_ACCEPTING_OUTREACH',
      'This candidate has temporarily paused new employer outreach.',
      403,
    );
  }

  // Anti-spam check: cap pending outreach per organization per 24h (max 25/day).
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentSent } = await supabaseAdmin
    .from('talent_contact_requests')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', employer.organization.id)
    .gte('created_at', sinceIso);

  if ((recentSent ?? 0) >= 25) {
    throw new TalentPoolError('OUTREACH_DAILY_CAP', 'Daily outreach limit (25 requests/day) reached for your organization.', 429);
  }

  const cleanMessage = defangUntrustedText(input.message, 2500);
  const nowIso = new Date().toISOString();

  const { data: reqRow, error: reqErr } = await supabaseAdmin
    .from('talent_contact_requests')
    .insert({
      organization_id: employer.organization.id,
      sender_user_id: recruiterUserId,
      candidate_user_id: input.candidate_user_id,
      vacancy_id: input.vacancy_id ?? null,
      request_type: input.request_type,
      role_title: input.role_title,
      message: cleanMessage,
      proposed_slots: input.proposed_slots,
      meeting_format: input.meeting_format ?? null,
      compensation_range: input.compensation_range ?? null,
      status: 'PENDING',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single();

  if (reqErr || !reqRow) {
    throw new TalentPoolError('CONTACT_REQUEST_FAILED', 'Unable to send contact request.', 500);
  }
  const requestId = (reqRow as { id: string }).id;

  // Create or update conversation thread.
  const { data: convRow } = await supabaseAdmin
    .from('talent_conversations')
    .upsert(
      {
        organization_id: employer.organization.id,
        candidate_user_id: input.candidate_user_id,
        contact_request_id: requestId,
        subject: `${employer.organization.company_name}: ${input.role_title}`,
        status: 'PENDING_CANDIDATE',
        last_message_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'organization_id,candidate_user_id' },
    )
    .select('id')
    .single();

  if (convRow) {
    await supabaseAdmin.from('talent_messages').insert({
      conversation_id: (convRow as { id: string }).id,
      sender_user_id: recruiterUserId,
      sender_role: 'RECRUITER',
      body: cleanMessage,
      created_at: nowIso,
    });
  }

  const { data: candProf } = await supabaseAdmin
    .from('profiles')
    .select('full_name,email')
    .eq('user_id', input.candidate_user_id)
    .maybeSingle();
  const cp = candProf as { full_name?: string | null; email?: string | null } | null;

  await notifyUser({
    userId: input.candidate_user_id,
    type: 'talent_pool',
    title: `${employer.organization.company_name} sent you a ${input.request_type === 'INTERVIEW_INVITATION' ? 'direct interview invitation' : 'contact request'}`,
    body: `Role: ${input.role_title}. Review the opportunity inside Jobiest to accept, decline, or reply.`,
    deepLink: '/talent-pool/requests',
    email: {
      to: cp?.email,
      firstName: cp?.full_name,
      subject: `New opportunity from ${employer.organization.company_name} on Jobiest`,
      ctaLabel: 'Review opportunity',
    },
  });

  await auditEvent({
    action: 'EMPLOYER_CONTACT_REQUEST_SENT',
    resource: 'talent_contact_requests',
    resourceId: requestId,
    userId: recruiterUserId,
    outcome: 'allow',
    meta: {
      organization_id: employer.organization.id,
      candidate_user_id: input.candidate_user_id,
      request_type: input.request_type,
    },
  });

  return { ok: true, requestId };
}

export async function respondToEmployerContactRequest(
  candidateUserId: string,
  requestId: string,
  input: z.infer<typeof candidateContactResponseSchema>,
) {
  const { data: reqRow } = await supabaseAdmin
    .from('talent_contact_requests')
    .select('id,organization_id,sender_user_id,candidate_user_id,role_title,status')
    .eq('id', requestId)
    .eq('candidate_user_id', candidateUserId)
    .maybeSingle();

  if (!reqRow) {
    throw new TalentPoolError('REQUEST_NOT_FOUND', 'Contact request not found.', 404);
  }
  const r = reqRow as {
    id: string;
    organization_id: string;
    sender_user_id: string;
    candidate_user_id: string;
    role_title: string;
    status: string;
  };

  const nextStatus = input.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
  const nowIso = new Date().toISOString();

  await supabaseAdmin
    .from('talent_contact_requests')
    .update({
      status: nextStatus,
      candidate_response_note: input.note ?? null,
      responded_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', requestId)
    .eq('candidate_user_id', candidateUserId);

  const { data: conv } = await supabaseAdmin
    .from('talent_conversations')
    .update({
      status: input.action === 'ACCEPT' ? 'ACTIVE' : 'DECLINED',
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .eq('organization_id', r.organization_id)
    .eq('candidate_user_id', candidateUserId)
    .select('id')
    .maybeSingle();

  if (conv && input.note?.trim()) {
    await supabaseAdmin.from('talent_messages').insert({
      conversation_id: (conv as { id: string }).id,
      sender_user_id: candidateUserId,
      sender_role: 'CANDIDATE',
      body: input.note.trim(),
      created_at: nowIso,
    });
  }

  await notifyUser({
    userId: r.sender_user_id,
    type: 'employer',
    title: `Candidate ${nextStatus.toLowerCase()} your outreach for ${r.role_title}`,
    body:
      input.action === 'ACCEPT'
        ? 'The candidate accepted your request. You can continue the conversation inside Jobiest Recruiter Hub.'
        : 'The candidate declined this outreach.',
    deepLink: '/employer',
  });

  return { ok: true, status: nextStatus };
}

export async function listConversationsForParticipant(userId: string) {
  const empCtx = await getEmployerContextForUser(userId);
  const orgId = empCtx?.organization.id ?? null;

  const [candConvs, empConvs] = await Promise.all([
    supabaseAdmin
      .from('talent_conversations')
      .select('*,employer_organizations(company_name,website_url,verification_status)')
      .eq('candidate_user_id', userId)
      .order('last_message_at', { ascending: false }),
    orgId
      ? supabaseAdmin
          .from('talent_conversations')
          .select('*')
          .eq('organization_id', orgId)
          .order('last_message_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return {
    candidateConversations: candConvs.data ?? [],
    employerConversations: empConvs.data ?? [],
  };
}

export async function getConversationMessagesForParticipant(userId: string, conversationId: string) {
  const { data: conv } = await supabaseAdmin
    .from('talent_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (!conv) throw new TalentPoolError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
  const c = conv as { id: string; organization_id: string; candidate_user_id: string; status: string; subject: string };

  const empCtx = await getEmployerContextForUser(userId);
  const isCandidate = c.candidate_user_id === userId;
  const isRecruiter = Boolean(empCtx && empCtx.organization.id === c.organization_id);

  if (!isCandidate && !isRecruiter) {
    throw new TalentPoolError('FORBIDDEN', 'You do not have access to this conversation.', 403);
  }

  const { data: messages } = await supabaseAdmin
    .from('talent_messages')
    .select('id,sender_user_id,sender_role,body,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  return {
    conversation: c,
    viewerRole: isCandidate ? ('CANDIDATE' as const) : ('RECRUITER' as const),
    messages: messages ?? [],
  };
}

export async function postConversationMessage(
  userId: string,
  conversationId: string,
  input: z.infer<typeof conversationMessageSchema>,
) {
  const detail = await getConversationMessagesForParticipant(userId, conversationId);
  if (detail.conversation.status === 'DECLINED' || detail.conversation.status === 'REPORTED') {
    throw new TalentPoolError('CONVERSATION_CLOSED', 'This conversation is closed.', 403);
  }
  if (detail.viewerRole === 'RECRUITER' && detail.conversation.status === 'PENDING_CANDIDATE') {
    throw new TalentPoolError(
      'AWAITING_CANDIDATE_ACCEPTANCE',
      'Wait for the candidate to accept your initial contact request before sending follow-up messages.',
      403,
    );
  }

  const nowIso = new Date().toISOString();
  const cleanBody = defangUntrustedText(input.body, 4000);

  const { data: msg, error } = await supabaseAdmin
    .from('talent_messages')
    .insert({
      conversation_id: conversationId,
      sender_user_id: userId,
      sender_role: detail.viewerRole,
      body: cleanBody,
      created_at: nowIso,
    })
    .select('id,sender_role,body,created_at')
    .single();

  if (error || !msg) {
    throw new TalentPoolError('MESSAGE_SEND_FAILED', 'Unable to send message.', 500);
  }

  await supabaseAdmin
    .from('talent_conversations')
    .update({ status: 'ACTIVE', last_message_at: nowIso, updated_at: nowIso })
    .eq('id', conversationId);

  return msg;
}

export async function reportTalentInteraction(
  reporterUserId: string,
  input: z.infer<typeof interactionReportCreateSchema>,
) {
  const empCtx = await getEmployerContextForUser(reporterUserId);
  const reporterRole: 'CANDIDATE' | 'RECRUITER' = empCtx ? 'RECRUITER' : 'CANDIDATE';
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('talent_interaction_reports')
    .insert({
      reporter_user_id: reporterUserId,
      reporter_role: reporterRole,
      organization_id: input.organization_id ?? empCtx?.organization.id ?? null,
      candidate_user_id: input.candidate_user_id ?? (reporterRole === 'CANDIDATE' ? reporterUserId : null),
      conversation_id: input.conversation_id ?? null,
      contact_request_id: input.contact_request_id ?? null,
      reason_category: input.reason_category,
      details: defangUntrustedText(input.details, 2000),
      status: 'OPEN',
      created_at: nowIso,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new TalentPoolError('REPORT_CREATE_FAILED', 'Unable to submit interaction report.', 500);
  }

  if (input.contact_request_id && reporterRole === 'CANDIDATE') {
    await supabaseAdmin
      .from('talent_contact_requests')
      .update({ status: 'REPORTED', updated_at: nowIso })
      .eq('id', input.contact_request_id)
      .eq('candidate_user_id', reporterUserId);
  }

  if (input.conversation_id) {
    await supabaseAdmin
      .from('talent_conversations')
      .update({ status: 'REPORTED', updated_at: nowIso })
      .eq('id', input.conversation_id);
  }

  await auditEvent({
    action: 'TALENT_INTERACTION_REPORTED',
    resource: 'talent_interaction_reports',
    resourceId: (data as { id: string }).id,
    userId: reporterUserId,
    outcome: 'allow',
    meta: { reason_category: input.reason_category, reporter_role: reporterRole },
  });

  return { ok: true, reportId: (data as { id: string }).id };
}
