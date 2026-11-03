import { SITE_URL } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase';
import { isRadarSchemaMissingError } from '@/lib/radar/sync/persistence';

/**
 * Public Verified Job Board & Google Jobs (`JobPosting`) SEO Engine.
 *
 * Security & Quality Guardrails:
 * 1. Only verified rows (`VERIFIED_HIGH_TRUST` or `VERIFIED_STANDARD`) are ever exposed.
 * 2. Internal crawler tokens, ETags, absence streaks, and raw evidence never leave the server.
 * 3. `JobPosting` JSON-LD is emitted ONLY while `lifecycle_status === 'ACTIVE'` and `validThrough` is in the future.
 * 4. Role & Location hub pages require `>= MIN_HUB_JOBS_FOR_INDEX` (3) active jobs before emitting `index, follow` or entering `sitemap.xml`.
 */

export const MIN_HUB_JOBS_FOR_INDEX = 3;

export interface PublicSeoJob {
  id: string;
  slug: string;
  title: string;
  companyName: string;
  department: string | null;
  careerCategory: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  workplaceType: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
  locationRaw: string | null;
  city: string | null;
  stateRegion: string | null;
  countryCode: string | null;
  countryCodes: string[];
  remoteRegionRestriction: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  skillsRequired: string[];
  skillsPreferred: string[];
  descriptionClean: string;
  applyUrl: string;
  verificationStatus: 'VERIFIED_HIGH_TRUST' | 'VERIFIED_STANDARD';
  lifecycleStatus: 'ACTIVE' | 'POTENTIALLY_CLOSING' | 'EXPIRED';
  publishedAt: string | null;
  validThrough: string | null;
  updatedAt: string;
}

export interface JobRoleHubSpec {
  slug: string;
  title: string;
  shortLabel: string;
  seoTitle: string;
  metaDescription: string;
  intro: string;
  matchTerms: string[];
  relatedCvRoleSlug: string;
}

export interface JobLocationHubSpec {
  slug: string;
  title: string;
  shortLabel: string;
  seoTitle: string;
  metaDescription: string;
  intro: string;
  workplaceFilter?: 'REMOTE' | 'HYBRID' | 'ONSITE';
  countryCodes?: string[];
  locationKeywords?: string[];
}

export const PUBLIC_JOB_ROLE_HUBS: JobRoleHubSpec[] = [
  {
    slug: 'software-engineer',
    title: 'Software Engineering Jobs',
    shortLabel: 'Software Engineering',
    seoTitle: 'Verified Software Engineer Jobs (Remote & Nigeria) | Jobiest',
    metaDescription: 'Browse verified fullstack, backend, frontend, and systems engineering openings from direct employer ATS boards on Jobiest.',
    intro: 'Direct employer software engineering roles verified from official ATS boards. Check how your CV aligns before applying with approval.',
    matchTerms: ['software', 'fullstack', 'full-stack', 'full stack', 'engineer', 'developer', 'backend', 'frontend', 'systems', 'platform', 'ios', 'android', 'mobile'],
    relatedCvRoleSlug: 'software-engineer',
  },
  {
    slug: 'frontend-engineer',
    title: 'Frontend & Web Engineering Jobs',
    shortLabel: 'Frontend',
    seoTitle: 'Verified Frontend Developer Jobs (React, TypeScript, Remote) | Jobiest',
    metaDescription: 'Explore verified frontend, UI engineering, React, and TypeScript roles sourced directly from employer career boards.',
    intro: 'Verified frontend and web engineering openings across remote-first and regional teams.',
    matchTerms: ['frontend', 'front-end', 'web engineer', 'ui engineer', 'react', 'design engineer'],
    relatedCvRoleSlug: 'frontend-developer',
  },
  {
    slug: 'backend-engineer',
    title: 'Backend & Infrastructure Jobs',
    shortLabel: 'Backend & Infra',
    seoTitle: 'Verified Backend, Cloud & Infrastructure Engineer Jobs | Jobiest',
    metaDescription: 'Find verified backend, distributed systems, API, DevOps, and cloud infrastructure roles with transparent requirements.',
    intro: 'Verified backend, API, cloud, and distributed systems engineering openings.',
    matchTerms: ['backend', 'back-end', 'infrastructure', 'distributed', 'devops', 'sre', 'site reliability', 'cloud', 'platform engineer'],
    relatedCvRoleSlug: 'backend-engineer',
  },
  {
    slug: 'data-analyst',
    title: 'Data, Analytics & BI Jobs',
    shortLabel: 'Data & Analytics',
    seoTitle: 'Verified Data Analyst & Data Science Jobs | Jobiest',
    metaDescription: 'Browse verified data analyst, analytics engineer, business intelligence, and data science roles from direct employer boards.',
    intro: 'Verified data analysis, business intelligence, analytics engineering, and data science openings.',
    matchTerms: ['data', 'analytics', 'analyst', 'business intelligence', 'bi ', 'scientist'],
    relatedCvRoleSlug: 'data-analyst',
  },
  {
    slug: 'product-manager',
    title: 'Product Management Jobs',
    shortLabel: 'Product Management',
    seoTitle: 'Verified Product Manager Jobs (Remote, EMEA & Africa) | Jobiest',
    metaDescription: 'Discover verified product manager, technical PM, and product operations roles sourced directly from hiring companies.',
    intro: 'Verified product management and product operations roles across fintech, SaaS, and consumer platforms.',
    matchTerms: ['product manager', 'product lead', 'head of product', 'product owner', 'product operations', 'technical product'],
    relatedCvRoleSlug: 'product-manager',
  },
  {
    slug: 'product-designer',
    title: 'Product, UX & UI Design Jobs',
    shortLabel: 'Design & UX',
    seoTitle: 'Verified Product Designer & UX/UI Jobs | Jobiest',
    metaDescription: 'Browse verified product design, UX research, brand design, and UI roles from direct employer job boards.',
    intro: 'Verified UX, UI, brand, and product design roles with direct employer application links.',
    matchTerms: ['designer', 'ux', 'ui', 'user research', 'design systems', 'creative'],
    relatedCvRoleSlug: 'ui-ux-designer',
  },
  {
    slug: 'marketing',
    title: 'Marketing, Content & Growth Jobs',
    shortLabel: 'Marketing & Growth',
    seoTitle: 'Verified Marketing, Growth & Content Jobs | Jobiest',
    metaDescription: 'Explore verified growth marketing, digital marketing, content strategy, and communications roles.',
    intro: 'Verified marketing, brand, growth, lifecycle, and communications roles.',
    matchTerms: ['marketing', 'growth', 'content', 'communications', 'brand', 'seo', 'social media', 'public relations'],
    relatedCvRoleSlug: 'digital-marketer',
  },
  {
    slug: 'sales-customer-success',
    title: 'Sales, Account Management & Customer Success Jobs',
    shortLabel: 'Sales & CS',
    seoTitle: 'Verified Sales, Account Executive & Customer Success Jobs | Jobiest',
    metaDescription: 'Find verified account executive, business development, solutions engineering, and customer success roles.',
    intro: 'Verified commercial, B2B sales, partnerships, and customer success openings.',
    matchTerms: ['sales', 'account executive', 'account manager', 'customer success', 'support', 'business development', 'partnerships', 'solutions'],
    relatedCvRoleSlug: 'customer-success-specialist',
  },
  {
    slug: 'finance-accounting',
    title: 'Finance, Accounting & Legal Jobs',
    shortLabel: 'Finance & Legal',
    seoTitle: 'Verified Finance, Accounting, Audit & Compliance Jobs | Jobiest',
    metaDescription: 'Browse verified financial analyst, accounting, treasury, compliance, and legal counsel openings.',
    intro: 'Verified finance, accounting, risk, compliance, and corporate legal roles.',
    matchTerms: ['finance', 'financial', 'accountant', 'accounting', 'audit', 'tax', 'treasury', 'legal', 'counsel', 'compliance', 'risk'],
    relatedCvRoleSlug: 'financial-analyst',
  },
  {
    slug: 'operations-hr',
    title: 'Operations, Project Management & People Jobs',
    shortLabel: 'Operations & People',
    seoTitle: 'Verified Operations, Project Manager & HR Jobs | Jobiest',
    metaDescription: 'Discover verified business operations, program management, recruiting, and people operations roles.',
    intro: 'Verified operations, program delivery, supply chain, and people/talent roles.',
    matchTerms: ['operations', 'project manager', 'program manager', 'chief of staff', 'recruiter', 'talent', 'people', 'hr ', 'human resources', 'supply chain'],
    relatedCvRoleSlug: 'project-manager',
  },
  {
    slug: 'cybersecurity-it',
    title: 'Cybersecurity, Security & IT Jobs',
    shortLabel: 'Security & IT',
    seoTitle: 'Verified Cybersecurity, AppSec & IT Engineering Jobs | Jobiest',
    metaDescription: 'Browse verified information security, application security, GRC, and IT systems roles from direct ATS boards.',
    intro: 'Verified security engineering, trust and safety, compliance security, and IT operations roles.',
    matchTerms: ['security', 'cybersecurity', 'infosec', 'appsec', 'trust', 'it engineer', 'it specialist'],
    relatedCvRoleSlug: 'cybersecurity-analyst',
  },
  {
    slug: 'graduate-entry-level',
    title: 'Internships, Graduate & Entry-Level Jobs',
    shortLabel: 'Graduate & Internships',
    seoTitle: 'Verified Graduate Trainee, Internship & Entry-Level Jobs | Jobiest',
    metaDescription: 'Find verified internships, graduate trainee programmes, junior roles, and early-career openings with zero agency middlemen.',
    intro: 'Verified early-career roles, internships, and graduate programmes suitable for recent graduates and junior candidates.',
    matchTerms: ['intern', 'internship', 'graduate', 'junior', 'entry', 'associate', 'new grad', 'trainee', 'apprentice'],
    relatedCvRoleSlug: 'fresh-graduate-no-experience',
  },
];

export const PUBLIC_JOB_LOCATION_HUBS: JobLocationHubSpec[] = [
  {
    slug: 'remote',
    title: 'Verified Remote Jobs',
    shortLabel: 'Remote Roles',
    seoTitle: 'Verified Remote Jobs (EMEA, Africa & Worldwide) | Jobiest',
    metaDescription: 'Browse verified remote job openings sourced directly from employer ATS boards. Filter by role, region, and workplace policy.',
    intro: 'Verified remote openings pulled directly from company ATS boards with clear regional eligibility.',
    workplaceFilter: 'REMOTE',
  },
  {
    slug: 'nigeria',
    title: 'Verified Jobs in Nigeria & Africa-Eligible Remote',
    shortLabel: 'Nigeria & Africa',
    seoTitle: 'Verified Jobs in Nigeria (Lagos, Abuja & Remote) | Jobiest',
    metaDescription: 'Discover verified jobs in Lagos, Abuja, and remote companies hiring across Nigeria, EMEA, and Africa.',
    intro: 'Verified roles located in Nigeria or open to EMEA/Africa remote applicants.',
    countryCodes: ['NG', 'ZA', 'KE', 'GH', 'EG'],
    locationKeywords: ['nigeria', 'lagos', 'abuja', 'africa', 'emea', 'worldwide', 'global', 'anywhere'],
  },
  {
    slug: 'uk-europe',
    title: 'Verified Jobs in UK & Europe (EMEA)',
    shortLabel: 'UK & Europe',
    seoTitle: 'Verified Tech & Corporate Jobs in UK & Europe | Jobiest',
    metaDescription: 'Explore verified remote, hybrid, and on-site openings across London, the UK, and European tech hubs.',
    intro: 'Verified roles across the United Kingdom and European timezones, sourced directly from employer career boards.',
    countryCodes: ['GB', 'UK', 'EU', 'DE', 'NL', 'FR', 'IE', 'ES', 'SE'],
    locationKeywords: ['london', 'united kingdom', 'uk', 'europe', 'emea', 'berlin', 'amsterdam', 'dublin', 'stockholm'],
  },
  {
    slug: 'us-canada',
    title: 'Verified Jobs in US & North America',
    shortLabel: 'US & Canada',
    seoTitle: 'Verified Tech, Product & Business Jobs in US & Canada | Jobiest',
    metaDescription: 'Browse verified remote, hybrid, and on-site roles across the United States and Canada from direct ATS feeds.',
    intro: 'Verified openings across North American hubs and US/Canada remote teams.',
    countryCodes: ['US', 'CA'],
    locationKeywords: ['united states', 'usa', 'north america', 'new york', 'san francisco', 'canada', 'toronto', 'remote - us'],
  },
  {
    slug: 'hybrid',
    title: 'Verified Hybrid Jobs',
    shortLabel: 'Hybrid Roles',
    seoTitle: 'Verified Hybrid Tech & Corporate Jobs | Jobiest',
    metaDescription: 'Explore verified hybrid job opportunities combining flexible remote work with in-office collaboration.',
    intro: 'Verified hybrid roles sourced directly from official employer ATS feeds.',
    workplaceFilter: 'HYBRID',
  },
  {
    slug: 'onsite',
    title: 'Verified On-Site Jobs',
    shortLabel: 'On-Site Roles',
    seoTitle: 'Verified On-Site Corporate & Engineering Jobs | Jobiest',
    metaDescription: 'Browse verified on-site roles from established companies with transparent office locations and direct applications.',
    intro: 'Verified on-site openings directly from employer career portals.',
    workplaceFilter: 'ONSITE',
  },
];

export function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'role';
}

export function formatCompanyDisplayName(raw: string): string {
  const clean = raw.trim();
  if (!clean) return 'Verified Employer';
  if (clean !== clean.toLowerCase()) return clean;
  return clean
    .split(/[\s_-]+/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

export function buildPublicJobSlug(row: { id: string; title: string; company_name: string }): string {
  const base = slugifySegment(`${row.title}-${row.company_name}`);
  const stableId = String(row.id).toLowerCase();
  return `${base}-${stableId}`;
}

export function extractJobIdPrefixFromSlug(slug: string): { fullUuid: string | null; prefix8: string | null } {
  const clean = slug.trim().toLowerCase();
  const uuidMatch = clean.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
  if (uuidMatch) return { fullUuid: uuidMatch[1], prefix8: uuidMatch[1].slice(0, 8) };
  const suffixMatch = clean.match(/(?:^|-)([0-9a-f]{8})$/);
  if (suffixMatch) return { fullUuid: null, prefix8: suffixMatch[1] };
  return { fullUuid: null, prefix8: null };
}

function toIsoOrFallback(value: unknown, fallback: string): string {
  if (!value) return fallback;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function optionalIso(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapRowToPublicSeoJob(row: Record<string, unknown>): PublicSeoJob {
  const id = String(row.id);
  const title = String(row.title ?? 'Open Role').trim();
  const companyRaw = String(row.company_name ?? 'Verified Employer');
  const publishedIso = optionalIso(row.posted_at);
  const updatedIso = toIsoOrFallback(row.updated_at ?? row.last_confirmed_live_at ?? row.first_seen_at, new Date(0).toISOString());
  const workplaceRaw = String(row.workplace_type ?? 'UNKNOWN').toUpperCase();
  const workplaceType: PublicSeoJob['workplaceType'] =
    workplaceRaw === 'REMOTE' || workplaceRaw === 'HYBRID' || workplaceRaw === 'ONSITE'
      ? workplaceRaw
      : 'UNKNOWN';

  const verRaw = String(row.verification_status ?? 'VERIFIED_STANDARD');
  const verificationStatus: PublicSeoJob['verificationStatus'] =
    verRaw === 'VERIFIED_HIGH_TRUST' ? 'VERIFIED_HIGH_TRUST' : 'VERIFIED_STANDARD';

  const lifeRaw = String(row.lifecycle_status ?? 'ACTIVE');
  const lifecycleStatus: PublicSeoJob['lifecycleStatus'] =
    lifeRaw === 'EXPIRED' ? 'EXPIRED' : lifeRaw === 'POTENTIALLY_CLOSING' ? 'POTENTIALLY_CLOSING' : 'ACTIVE';

  return {
    id,
    slug: buildPublicJobSlug({ id, title, company_name: companyRaw }),
    title,
    companyName: formatCompanyDisplayName(companyRaw),
    department: row.department ? String(row.department) : null,
    careerCategory: row.career_category ? String(row.career_category) : null,
    seniorityLevel: row.seniority_level ? String(row.seniority_level) : null,
    employmentType: row.employment_type ? String(row.employment_type) : null,
    workplaceType,
    locationRaw: row.location_raw ? String(row.location_raw) : null,
    city: row.normalized_city ? String(row.normalized_city) : null,
    stateRegion: row.state_region ? String(row.state_region) : null,
    countryCode: row.country_code ? String(row.country_code) : null,
    countryCodes: Array.isArray(row.country_codes) ? row.country_codes.map(String) : [],
    remoteRegionRestriction: row.remote_region_restriction ? String(row.remote_region_restriction) : null,
    salaryMin: row.salary_min != null && Number.isFinite(Number(row.salary_min)) ? Number(row.salary_min) : null,
    salaryMax: row.salary_max != null && Number.isFinite(Number(row.salary_max)) ? Number(row.salary_max) : null,
    salaryCurrency: row.salary_currency ? String(row.salary_currency) : null,
    salaryPeriod: row.salary_period ? String(row.salary_period) : null,
    skillsRequired: Array.isArray(row.skills_required) ? row.skills_required.map(String).slice(0, 20) : [],
    skillsPreferred: Array.isArray(row.skills_preferred) ? row.skills_preferred.map(String).slice(0, 15) : [],
    descriptionClean: String(row.description_clean ?? '').trim(),
    applyUrl: String(row.canonical_apply_url ?? row.apply_url ?? ''),
    verificationStatus,
    lifecycleStatus,
    publishedAt: publishedIso,
    validThrough: optionalIso(row.valid_through),
    updatedAt: updatedIso,
  };
}

const PUBLIC_JOB_SELECT_COLS = [
  'id',
  'title',
  'company_name',
  'department',
  'career_category',
  'seniority_level',
  'employment_type',
  'workplace_type',
  'location_raw',
  'normalized_city',
  'state_region',
  'country_code',
  'country_codes',
  'remote_region_restriction',
  'salary_min',
  'salary_max',
  'salary_currency',
  'salary_period',
  'skills_required',
  'skills_preferred',
  'description_clean',
  'apply_url',
  'canonical_apply_url',
  'verification_status',
  'lifecycle_status',
  'posted_at',
  'valid_through',
  'first_seen_at',
  'last_confirmed_live_at',
  'updated_at',
].join(',');

export async function listActivePublicJobs(limit = 500): Promise<PublicSeoJob[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('radar_jobs')
      .select(PUBLIC_JOB_SELECT_COLS)
      .in('verification_status', ['VERIFIED_HIGH_TRUST', 'VERIFIED_STANDARD'])
      .eq('lifecycle_status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isRadarSchemaMissingError(error)) return [];
      return [];
    }
    return ((data ?? []) as unknown as Array<Record<string, unknown>>)
      .map(mapRowToPublicSeoJob)
      .filter((job) => job.descriptionClean.length >= 60 && Boolean(job.applyUrl));
  } catch {
    return [];
  }
}

export async function getPublicJobBySlug(slug: string): Promise<PublicSeoJob | null> {
  const { fullUuid, prefix8 } = extractJobIdPrefixFromSlug(slug);
  if (!fullUuid && !prefix8) return null;

  try {
    if (fullUuid) {
      const { data, error } = await supabaseAdmin
        .from('radar_jobs')
        .select(PUBLIC_JOB_SELECT_COLS)
        .eq('id', fullUuid)
        .in('verification_status', ['VERIFIED_HIGH_TRUST', 'VERIFIED_STANDARD'])
        .in('lifecycle_status', ['ACTIVE', 'POTENTIALLY_CLOSING', 'EXPIRED'])
        .maybeSingle();
      if (error || !data) return null;
      return mapRowToPublicSeoJob(data as unknown as Record<string, unknown>);
    }

    // Match 8-hex UUID range: `xxxxxxxx-0000-0000-0000-000000000000` .. `xxxxxxxx-ffff-ffff-ffff-ffffffffffff`
    const lowerUuid = `${prefix8}-0000-0000-0000-000000000000`;
    const upperUuid = `${prefix8}-ffff-ffff-ffff-ffffffffffff`;
    const { data, error } = await supabaseAdmin
      .from('radar_jobs')
      .select(PUBLIC_JOB_SELECT_COLS)
      .gte('id', lowerUuid)
      .lte('id', upperUuid)
      .in('verification_status', ['VERIFIED_HIGH_TRUST', 'VERIFIED_STANDARD'])
      .in('lifecycle_status', ['ACTIVE', 'POTENTIALLY_CLOSING', 'EXPIRED'])
      .limit(5);

    if (error || !data || data.length === 0) return null;
    const mapped = (data as unknown as Array<Record<string, unknown>>).map(mapRowToPublicSeoJob);
    return mapped.find((j) => j.slug === slug) ?? mapped[0] ?? null;
  } catch {
    return null;
  }
}

export function jobMatchesRoleHub(job: PublicSeoJob, hub: JobRoleHubSpec): boolean {
  const hay = [
    job.title,
    job.department,
    job.careerCategory,
    job.seniorityLevel,
    ...job.skillsRequired,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hub.matchTerms.some((term) => hay.includes(term.toLowerCase()));
}

export function jobMatchesLocationHub(job: PublicSeoJob, hub: JobLocationHubSpec): boolean {
  if (hub.workplaceFilter && job.workplaceType !== hub.workplaceFilter) {
    return false;
  }
  if (!hub.countryCodes && !hub.locationKeywords) {
    return true;
  }
  const codes = new Set([job.countryCode, ...job.countryCodes].filter(Boolean).map((c) => String(c).toUpperCase()));
  if (hub.countryCodes?.some((code) => codes.has(code.toUpperCase()))) {
    return true;
  }
  const locHay = [job.locationRaw, job.city, job.stateRegion, job.remoteRegionRestriction]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return Boolean(hub.locationKeywords?.some((kw) => locHay.includes(kw.toLowerCase())));
}

export function mapGoogleEmploymentType(raw: string | null): string {
  const norm = (raw ?? '').toLowerCase();
  if (norm.includes('part')) return 'PART_TIME';
  if (norm.includes('contract') || norm.includes('freelance')) return 'CONTRACTOR';
  if (norm.includes('intern')) return 'INTERN';
  if (norm.includes('temp')) return 'TEMPORARY';
  return 'FULL_TIME';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDescriptionHtml(cleanText: string): string {
  const paragraphs = cleanText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 24);
  if (!paragraphs.length) return `<p>${escapeHtml(cleanText)}</p>`;
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

const VALID_ISO2_COUNTRY = /^[A-Z]{2}$/;
const NON_COUNTRY_CODES = new Set(['EU', 'UK', 'EMEA', 'APAC', 'LATAM', 'GLOBAL', 'WW']);

function normalizeIsoCountry(code: string | null): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  if (upper === 'UK') return 'GB';
  if (NON_COUNTRY_CODES.has(upper)) return null;
  return VALID_ISO2_COUNTRY.test(upper) ? upper : null;
}

/**
 * Build strict Google-compliant `JobPosting` JSON-LD.
 * Returns `null` if the job is expired so expired pages never trigger Google structured-data warnings.
 */
export function buildJobPostingJsonLd(job: PublicSeoJob): Record<string, unknown> | null {
  if (job.lifecycleStatus !== 'ACTIVE' || !job.publishedAt || !job.validThrough) return null;
  if (new Date(job.validThrough).getTime() <= Date.now()) return null;

  const isoCountries = [
    normalizeIsoCountry(job.countryCode),
    ...job.countryCodes.map(normalizeIsoCountry),
  ].filter((v): v is string => Boolean(v));
  const uniqueCountries = Array.from(new Set(isoCountries));

  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: formatDescriptionHtml(job.descriptionClean),
    identifier: {
      '@type': 'PropertyValue',
      name: job.companyName,
      value: job.id,
    },
    datePosted: job.publishedAt,
    validThrough: job.validThrough,
    employmentType: mapGoogleEmploymentType(job.employmentType),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.companyName,
    },
    url: `${SITE_URL}/jobs/${job.slug}`,
    directApply: false,
  };

  if (job.workplaceType === 'REMOTE') {
    payload.jobLocationType = 'TELECOMMUTE';
    if (uniqueCountries.length > 0) {
      payload.applicantLocationRequirements = uniqueCountries.map((country) => ({
        '@type': 'Country',
        name: country,
      }));
    } else if (job.locationRaw) {
      payload.applicantLocationRequirements = {
        '@type': 'AdministrativeArea',
        name: job.locationRaw,
      };
    }
  } else {
    const locality = job.city ?? job.locationRaw;
    if (locality || job.stateRegion || uniqueCountries[0]) {
      payload.jobLocation = {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          ...(locality ? { addressLocality: locality } : {}),
          ...(job.stateRegion ? { addressRegion: job.stateRegion } : {}),
          ...(uniqueCountries[0] ? { addressCountry: uniqueCountries[0] } : {}),
        },
      };
    }
  }

  // Only emit baseSalary when genuinely present in the verified source listing (never invented).
  if (job.salaryCurrency && (job.salaryMin != null || job.salaryMax != null)) {
    const unitText = (job.salaryPeriod ?? 'YEAR').toUpperCase();
    payload.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.salaryCurrency,
      value: {
        '@type': 'QuantitativeValue',
        ...(job.salaryMin != null ? { minValue: job.salaryMin } : {}),
        ...(job.salaryMax != null ? { maxValue: job.salaryMax } : {}),
        unitText,
      },
    };
  }

  return payload;
}
