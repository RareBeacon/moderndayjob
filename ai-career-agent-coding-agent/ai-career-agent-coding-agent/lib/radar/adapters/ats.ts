import { capText, cleanLine, htmlToText } from '@/lib/jobsources/normalize';
import type { RadarPostingInput, SalaryPeriod, WorkplaceType } from '../types';

/**
 * Agent 02 - Deterministic Public ATS Collector (11 Authorized Public Providers)
 *
 * Zero AI tokens. Zero fabricated fields (`null` whenever a source omits salary,
 * seniority, department, or dates). All listing HTML is treated as untrusted input
 * and stripped deterministically via `htmlToText()`.
 */

export type RadarAtsProvider =
  | 'greenhouse'
  | 'lever'
  | 'lever_eu'
  | 'ashby'
  | 'workable'
  | 'recruitee'
  | 'personio'
  | 'pinpoint'
  | 'gem'
  | 'polymer'
  | 'breezy'
  | 'teamtailor';

export function buildAtsBoardEndpointUrl(provider: RadarAtsProvider, boardToken: string): string {
  const token = encodeURIComponent(boardToken.trim());
  switch (provider) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true&pay_transparency=true`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${token}?mode=json`;
    case 'lever_eu':
      return `https://api.eu.lever.co/v0/postings/${token}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`;
    case 'workable':
      return `https://apply.workable.com/api/v1/widget/accounts/${token}?details=true`;
    case 'recruitee':
      return `https://${boardToken.trim().toLowerCase()}.recruitee.com/api/offers/`;
    case 'personio':
      return `https://${boardToken.trim().toLowerCase()}.jobs.personio.de/xml?language=en`;
    case 'pinpoint':
      return `https://${boardToken.trim().toLowerCase()}.pinpointhq.com/postings.json`;
    case 'gem':
      return `https://api.gem.com/job_board/v0/${token}/job_posts/`;
    case 'polymer':
      return `https://api.polymer.co/v1/hire/organizations/${token}/jobs`;
    case 'breezy':
      return `https://${boardToken.trim().toLowerCase()}.breezy.hr/json`;
    case 'teamtailor':
      return `https://${boardToken.trim().toLowerCase()}.jobs.teamtailor.com/jobs.rss`;
  }
}

function humanizeSlug(slug: string): string {
  return cleanLine(slug.replace(/[-_]+/g, ' ')) ?? slug;
}

function normalizeWorkplace(raw: string | null | undefined, fallbackRemoteBool?: boolean | null): WorkplaceType {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'remote' || v === 'fully_remote' || v === 'telecommuting' || v === 'distributed') return 'REMOTE';
  if (v === 'hybrid' || v === 'flexible') return 'HYBRID';
  if (
    v === 'onsite' ||
    v === 'on-site' ||
    v === 'on_site' ||
    v === 'in_person' ||
    v === 'in-office' ||
    v === 'office'
  ) {
    return 'ONSITE';
  }
  if (fallbackRemoteBool === true) return 'REMOTE';
  return 'UNKNOWN';
}

function normalizeSalaryPeriod(raw: string | null | undefined): SalaryPeriod | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (/year|annual|yr|pa|per_year|1 year/.test(v)) return 'YEAR';
  if (/month|mo|monthly|per_month/.test(v)) return 'MONTH';
  if (/week|wk|weekly/.test(v)) return 'WEEK';
  if (/day|daily/.test(v)) return 'DAY';
  if (/hour|hr|hourly/.test(v)) return 'HOUR';
  return null;
}

function parseIsoTimestampOrNull(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return new Date(raw).toISOString();
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Recruitee non-ISO UTC format: "2026-10-15 09:30:00 UTC"
  const normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC$/i, '$1T$2Z');
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function positiveFiniteOrNull(val: unknown): number | null {
  const n = typeof val === 'number' ? val : typeof val === 'string' && val.trim() ? Number(val) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ==========================================================================
   1. Greenhouse
   ========================================================================== */
interface GreenhousePayRange {
  min_cents?: number | null;
  max_cents?: number | null;
  currency_type?: string | null;
  title?: string | null;
}

interface GreenhousePosting {
  id?: number | string;
  internal_job_id?: number | string | null;
  requisition_id?: string | null;
  title?: string;
  updated_at?: string;
  first_published?: string;
  absolute_url?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  content?: string;
  pay_input_ranges?: GreenhousePayRange[];
}

export function parseGreenhousePayload(boardToken: string, rawJson: string, limit = 500): RadarPostingInput[] {
  const parsed = JSON.parse(rawJson) as { jobs?: GreenhousePosting[] };
  const sourceId = `greenhouse:${boardToken}`;
  const out: RadarPostingInput[] = [];

  for (const job of (parsed.jobs ?? []).slice(0, limit)) {
    if (job.id == null || !job.title || !job.absolute_url) continue;
    const locName = cleanLine(job.location?.name);
    const workplace: WorkplaceType = locName
      ? /\bhybrid\b/i.test(locName)
        ? 'HYBRID'
        : /\bremote\b/i.test(locName)
          ? 'REMOTE'
          : 'UNKNOWN'
      : 'UNKNOWN';

    const range = job.pay_input_ranges?.[0];
    const minCents = positiveFiniteOrNull(range?.min_cents);
    const maxCents = positiveFiniteOrNull(range?.max_cents);

    out.push({
      providerKey: 'greenhouse',
      sourceId,
      externalId: String(job.id),
      externalRequisitionId: job.requisition_id ?? (job.internal_job_id != null ? String(job.internal_job_id) : null),
      companyName: humanizeSlug(boardToken),
      employerSlugHint: boardToken,
      title: cleanLine(job.title) ?? 'Untitled role',
      url: job.absolute_url,
      applyUrl: job.absolute_url,
      descriptionPlain: capText(htmlToText(job.content ?? '')),
      locationRaw: locName,
      workplaceType: workplace,
      department: cleanLine(job.departments?.[0]?.name),
      salaryMin: minCents != null ? Number((minCents / 100).toFixed(2)) : null,
      salaryMax: maxCents != null ? Number((maxCents / 100).toFixed(2)) : null,
      salaryCurrency: cleanLine(range?.currency_type)?.toUpperCase() ?? null,
      salaryPeriod: range ? (normalizeSalaryPeriod(range.title) ?? 'YEAR') : null,
      postedAt: parseIsoTimestampOrNull(job.first_published),
      updatedAt: parseIsoTimestampOrNull(job.updated_at),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Greenhouse board',
    });
  }
  return out;
}

/* ==========================================================================
   2. Lever (US & EU)
   ========================================================================== */
interface LeverPostingRaw {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  workplaceType?: string;
  country?: string;
  descriptionPlain?: string;
  description?: string;
  lists?: Array<{ text?: string; content?: string }>;
  categories?: {
    location?: string;
    allLocations?: string[];
    commitment?: string;
    team?: string;
    department?: string;
  };
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
  };
  createdAt?: number;
}

export function parseLeverPayload(
  companySlug: string,
  rawJson: string,
  region: 'us' | 'eu' = 'us',
  limit = 500,
): RadarPostingInput[] {
  const postings = JSON.parse(rawJson) as LeverPostingRaw[];
  if (!Array.isArray(postings)) return [];
  const providerKey = region === 'eu' ? 'lever_eu' : 'lever';
  const sourceId = `${providerKey}:${companySlug}`;
  const out: RadarPostingInput[] = [];

  for (const p of postings.slice(0, limit)) {
    if (!p.id || !p.text || !p.hostedUrl) continue;
    const listSections = (p.lists ?? [])
      .map((l) => `${cleanLine(l.text) ?? ''}\n${htmlToText(l.content ?? '')}`.trim())
      .filter(Boolean)
      .join('\n\n');
    const baseDesc =
      p.descriptionPlain && p.descriptionPlain.trim().length > 0
        ? p.descriptionPlain.trim()
        : htmlToText(p.description ?? '');
    const descriptionPlain = capText([baseDesc, listSections].filter(Boolean).join('\n\n'));

    out.push({
      providerKey,
      sourceId,
      externalId: p.id,
      companyName: humanizeSlug(companySlug),
      employerSlugHint: companySlug,
      title: cleanLine(p.text) ?? 'Untitled role',
      url: p.hostedUrl,
      applyUrl: p.applyUrl ?? p.hostedUrl,
      descriptionPlain,
      locationRaw: cleanLine(p.categories?.location),
      countryCode: cleanLine(p.country)?.toUpperCase() ?? null,
      secondaryLocations: (p.categories?.allLocations ?? []).map((x) => x.trim()).filter(Boolean),
      workplaceType: normalizeWorkplace(p.workplaceType),
      department: cleanLine(p.categories?.department ?? p.categories?.team),
      employmentType: cleanLine(p.categories?.commitment),
      salaryMin: positiveFiniteOrNull(p.salaryRange?.min),
      salaryMax: positiveFiniteOrNull(p.salaryRange?.max),
      salaryCurrency: cleanLine(p.salaryRange?.currency)?.toUpperCase() ?? null,
      salaryPeriod: normalizeSalaryPeriod(p.salaryRange?.interval),
      postedAt: parseIsoTimestampOrNull(p.createdAt),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: `Listing data from the employer public Lever${region === 'eu' ? ' EU' : ''} board`,
    });
  }
  return out;
}

/* ==========================================================================
   3. Ashby (Fixes 2026 workplaceType vs isRemote Hybrid conflation)
   ========================================================================== */
interface AshbyCompComponent {
  compensationType?: string;
  interval?: string;
  currencyCode?: string;
  minValue?: number | null;
  maxValue?: number | null;
}

interface AshbyJobRaw {
  id?: string;
  title?: string;
  jobUrl?: string;
  applyUrl?: string;
  location?: string;
  workplaceType?: string; // 'Remote' | 'Hybrid' | 'OnSite'
  isRemote?: boolean;
  department?: string;
  employmentType?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  description?: string;
  publishedAt?: string;
  address?: {
    postalAddress?: {
      addressLocality?: string;
      addressRegion?: string;
      addressCountry?: string;
    };
  };
  secondaryLocations?: Array<{ location?: string }>;
  compensation?: {
    summaryComponents?: AshbyCompComponent[];
  };
}

export function parseAshbyPayload(orgSlug: string, rawJson: string, limit = 500): RadarPostingInput[] {
  const data = JSON.parse(rawJson) as { jobs?: AshbyJobRaw[]; organization?: { name?: string } };
  const sourceId = `ashby:${orgSlug}`;
  const companyName = cleanLine(data.organization?.name) ?? humanizeSlug(orgSlug);
  const out: RadarPostingInput[] = [];

  for (const job of (data.jobs ?? []).slice(0, limit)) {
    if (!job.id || !job.title || !job.jobUrl) continue;

    // Crucial Ashby 2026 rule: inspect `workplaceType` BEFORE `isRemote`, because Ashby
    // often sets `isRemote: true` on Hybrid postings!
    const workplaceType = job.workplaceType
      ? normalizeWorkplace(job.workplaceType, null)
      : normalizeWorkplace(null, job.isRemote);

    const salaryComp =
      (job.compensation?.summaryComponents ?? []).find((c) => /salary|base|cash/i.test(c.compensationType ?? '')) ??
      job.compensation?.summaryComponents?.[0];

    const descRaw = job.descriptionPlain?.trim()
      ? job.descriptionPlain.trim()
      : htmlToText(job.descriptionHtml ?? job.description ?? '');

    out.push({
      providerKey: 'ashby',
      sourceId,
      externalId: job.id,
      companyName,
      employerSlugHint: orgSlug,
      title: cleanLine(job.title) ?? 'Untitled role',
      url: job.jobUrl,
      applyUrl: job.applyUrl ?? job.jobUrl,
      descriptionPlain: capText(descRaw),
      locationRaw: cleanLine(job.location),
      city: cleanLine(job.address?.postalAddress?.addressLocality),
      stateRegion: cleanLine(job.address?.postalAddress?.addressRegion),
      countryCode: cleanLine(job.address?.postalAddress?.addressCountry),
      secondaryLocations: (job.secondaryLocations ?? [])
        .map((s) => cleanLine(s.location))
        .filter((s): s is string => Boolean(s)),
      workplaceType,
      department: cleanLine(job.department),
      employmentType: cleanLine(job.employmentType),
      salaryMin: positiveFiniteOrNull(salaryComp?.minValue),
      salaryMax: positiveFiniteOrNull(salaryComp?.maxValue),
      salaryCurrency: cleanLine(salaryComp?.currencyCode)?.toUpperCase() ?? null,
      salaryPeriod: salaryComp ? (normalizeSalaryPeriod(salaryComp.interval) ?? 'YEAR') : null,
      postedAt: parseIsoTimestampOrNull(job.publishedAt),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Ashby board',
    });
  }
  return out;
}

/* ==========================================================================
   4. Workable (`?details=true` full description + requirements + benefits)
   ========================================================================== */
interface WorkableWidgetJob {
  title?: string;
  url?: string;
  application_url?: string;
  shortcode?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  telecommuting?: boolean;
  workplace_type?: string;
  department?: string;
  employment_type?: string;
  description?: string;
  requirements?: string;
  benefits?: string;
  published_on?: string;
}

export function parseWorkablePayload(accountSlug: string, rawJson: string, limit = 500): RadarPostingInput[] {
  const data = JSON.parse(rawJson) as { name?: string; jobs?: WorkableWidgetJob[] };
  const sourceId = `workable:${accountSlug}`;
  const companyName = cleanLine(data.name) ?? humanizeSlug(accountSlug);
  const out: RadarPostingInput[] = [];

  for (const job of (data.jobs ?? []).slice(0, limit)) {
    if (!job.title || !job.url) continue;
    const descParts = [job.description, job.requirements, job.benefits]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => htmlToText(s));
    const locRaw = cleanLine([job.city, job.state, job.country].filter(Boolean).join(', '));
    const workplaceType = job.workplace_type
      ? normalizeWorkplace(job.workplace_type, null)
      : normalizeWorkplace(null, job.telecommuting);

    out.push({
      providerKey: 'workable',
      sourceId,
      externalId: job.shortcode ?? job.url,
      externalRequisitionId: job.shortcode ?? null,
      companyName,
      employerSlugHint: accountSlug,
      title: cleanLine(job.title) ?? 'Untitled role',
      url: job.url,
      applyUrl: job.application_url ?? job.url,
      descriptionPlain: capText(descParts.join('\n\n')),
      locationRaw: locRaw,
      city: cleanLine(job.city),
      stateRegion: cleanLine(job.state),
      countryCode: cleanLine(job.country_code ?? job.country),
      workplaceType,
      department: cleanLine(job.department),
      employmentType: cleanLine(job.employment_type),
      postedAt: parseIsoTimestampOrNull(job.published_on),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Workable board',
    });
  }
  return out;
}

/* ==========================================================================
   5. Recruitee (`{slug}.recruitee.com/api/offers/`)
   ========================================================================== */
interface RecruiteeOffer {
  id?: number | string;
  slug?: string;
  title?: string;
  company_name?: string;
  careers_url?: string;
  careers_apply_url?: string;
  description?: string;
  requirements?: string;
  city?: string;
  state_name?: string;
  country_code?: string;
  location?: string;
  remote?: boolean;
  hybrid?: boolean;
  on_site?: boolean;
  department?: string;
  employment_type_code?: string;
  published_at?: string;
  salary?: {
    min?: number | string | null;
    max?: number | string | null;
    currency?: string | null;
    period?: string | null;
  };
}

export function parseRecruiteePayload(slug: string, rawJson: string, limit = 500): RadarPostingInput[] {
  const data = JSON.parse(rawJson) as { offers?: RecruiteeOffer[] };
  const sourceId = `recruitee:${slug}`;
  const out: RadarPostingInput[] = [];

  for (const o of (data.offers ?? []).slice(0, limit)) {
    if (o.id == null || !o.title || !o.careers_url) continue;
    const workplaceType: WorkplaceType = o.hybrid
      ? 'HYBRID'
      : o.remote
        ? 'REMOTE'
        : o.on_site
          ? 'ONSITE'
          : 'UNKNOWN';
    const desc = [o.description, o.requirements]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => htmlToText(s))
      .join('\n\n');

    out.push({
      providerKey: 'recruitee',
      sourceId,
      externalId: String(o.id),
      companyName: cleanLine(o.company_name) ?? humanizeSlug(slug),
      employerSlugHint: slug,
      title: cleanLine(o.title) ?? 'Untitled role',
      url: o.careers_url,
      applyUrl: o.careers_apply_url ?? o.careers_url,
      descriptionPlain: capText(desc),
      locationRaw: cleanLine(o.location ?? [o.city, o.state_name, o.country_code].filter(Boolean).join(', ')),
      city: cleanLine(o.city),
      stateRegion: cleanLine(o.state_name),
      countryCode: cleanLine(o.country_code)?.toUpperCase() ?? null,
      workplaceType,
      department: cleanLine(o.department),
      employmentType: cleanLine(o.employment_type_code),
      salaryMin: positiveFiniteOrNull(o.salary?.min),
      salaryMax: positiveFiniteOrNull(o.salary?.max),
      salaryCurrency: cleanLine(o.salary?.currency)?.toUpperCase() ?? null,
      salaryPeriod: normalizeSalaryPeriod(o.salary?.period),
      postedAt: parseIsoTimestampOrNull(o.published_at),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Recruitee career site',
    });
  }
  return out;
}

/* ==========================================================================
   6. Personio XML (`{company}.jobs.personio.de/xml?language=en`)
   ========================================================================== */
function extractXmlTagText(block: string, tag: string): string | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = block.indexOf(open);
  if (start === -1) return null;
  const end = block.indexOf(close, start + open.length);
  if (end === -1) return null;
  const inner = block
    .slice(start + open.length, end)
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .trim();
  return inner.length > 0 ? inner : null;
}

export function parsePersonioXmlPayload(companySlug: string, rawXml: string, limit = 500): RadarPostingInput[] {
  const sourceId = `personio:${companySlug}`;
  const out: RadarPostingInput[] = [];
  const blocks = rawXml.split('<position>').slice(1, limit + 1);

  for (const rawBlock of blocks) {
    const endIdx = rawBlock.indexOf('</position>');
    const block = endIdx === -1 ? rawBlock : rawBlock.slice(0, endIdx);

    const id = extractXmlTagText(block, 'id');
    const title = extractXmlTagText(block, 'name');
    if (!id || !title) continue;

    const subcompany = extractXmlTagText(block, 'subcompany');
    const office = extractXmlTagText(block, 'office');
    const department = extractXmlTagText(block, 'department');
    const employmentType = extractXmlTagText(block, 'employmentType');
    const seniority = extractXmlTagText(block, 'seniority');
    const createdAt = extractXmlTagText(block, 'createdAt');

    // Collect all <jobDescription> sections
    const descChunks: string[] = [];
    const jdParts = block.split('<jobDescription>').slice(1);
    for (const jd of jdParts) {
      const jdEnd = jd.indexOf('</jobDescription>');
      const section = jdEnd === -1 ? jd : jd.slice(0, jdEnd);
      const heading = extractXmlTagText(section, 'name');
      const value = extractXmlTagText(section, 'value');
      if (value) {
        const plain = htmlToText(value);
        descChunks.push(heading ? `${cleanLine(heading) ?? heading}\n${plain}` : plain);
      }
    }

    const url = `https://${companySlug.toLowerCase()}.jobs.personio.de/job/${encodeURIComponent(id)}`;
    const workplaceType: WorkplaceType = office
      ? /\bhybrid\b/i.test(office)
        ? 'HYBRID'
        : /\bremote\b/i.test(office)
          ? 'REMOTE'
          : 'ONSITE'
      : 'UNKNOWN';

    out.push({
      providerKey: 'personio',
      sourceId,
      externalId: id,
      companyName: cleanLine(subcompany) ?? humanizeSlug(companySlug),
      employerSlugHint: companySlug,
      title: cleanLine(title) ?? 'Untitled role',
      url,
      applyUrl: `${url}#apply`,
      descriptionPlain: capText(descChunks.join('\n\n')),
      locationRaw: cleanLine(office),
      workplaceType,
      department: cleanLine(department),
      employmentType: cleanLine(employmentType),
      seniorityLevel: cleanLine(seniority),
      postedAt: parseIsoTimestampOrNull(createdAt),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Personio XML feed',
    });
  }
  return out;
}

/* ==========================================================================
   7. Pinpoint (`{subdomain}.pinpointhq.com/postings.json`)
   ========================================================================== */
interface PinpointJob {
  id?: string | number;
  title?: string;
  url?: string;
  workplace_type?: string;
  employment_type_text?: string;
  employment_type?: string;
  description?: string;
  key_responsibilities?: string;
  skills_knowledge_expertise?: string;
  compensation_visible?: boolean;
  compensation_minimum?: number | string | null;
  compensation_maximum?: number | string | null;
  compensation_currency?: string | null;
  compensation_frequency?: string | null;
  location?: {
    name?: string;
    city?: string;
    province?: string;
  };
  job?: {
    department?: { name?: string };
    requisition_id?: string;
  };
}

export function parsePinpointPayload(subdomain: string, rawJson: string, limit = 500): RadarPostingInput[] {
  const parsed = JSON.parse(rawJson) as { data?: PinpointJob[] } | PinpointJob[];
  const list = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
  const sourceId = `pinpoint:${subdomain}`;
  const out: RadarPostingInput[] = [];

  for (const item of list.slice(0, limit)) {
    if (item.id == null || !item.title || !item.url) continue;
    const desc = [item.description, item.key_responsibilities, item.skills_knowledge_expertise]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => htmlToText(s))
      .join('\n\n');

    const showComp = item.compensation_visible !== false;
    out.push({
      providerKey: 'pinpoint',
      sourceId,
      externalId: String(item.id),
      externalRequisitionId: cleanLine(item.job?.requisition_id),
      companyName: humanizeSlug(subdomain),
      employerSlugHint: subdomain,
      title: cleanLine(item.title) ?? 'Untitled role',
      url: item.url,
      applyUrl: item.url,
      descriptionPlain: capText(desc),
      locationRaw: cleanLine(item.location?.name ?? [item.location?.city, item.location?.province].filter(Boolean).join(', ')),
      city: cleanLine(item.location?.city),
      stateRegion: cleanLine(item.location?.province),
      workplaceType: normalizeWorkplace(item.workplace_type),
      department: cleanLine(item.job?.department?.name),
      employmentType: cleanLine(item.employment_type_text ?? item.employment_type),
      salaryMin: showComp ? positiveFiniteOrNull(item.compensation_minimum) : null,
      salaryMax: showComp ? positiveFiniteOrNull(item.compensation_maximum) : null,
      salaryCurrency: showComp ? (cleanLine(item.compensation_currency)?.toUpperCase() ?? null) : null,
      salaryPeriod: showComp ? normalizeSalaryPeriod(item.compensation_frequency) : null,
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Pinpoint board',
    });
  }
  return out;
}

/* ==========================================================================
   8. Gem (`api.gem.com/job_board/v0/{slug}/job_posts/`)
   ========================================================================== */
interface GemJobPost {
  id?: string;
  internal_job_id?: string;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  location_type?: string;
  employment_type?: string;
  departments?: Array<{ name?: string }>;
  content_plain?: string;
  content_html?: string;
  first_published_at?: string;
}

export function parseGemPayload(slug: string, rawJson: string, limit = 500): RadarPostingInput[] {
  const parsed = JSON.parse(rawJson) as GemJobPost[] | { data?: GemJobPost[]; jobs?: GemJobPost[] };
  const list = Array.isArray(parsed) ? parsed : (parsed.data ?? parsed.jobs ?? []);
  const sourceId = `gem:${slug}`;
  const out: RadarPostingInput[] = [];

  for (const item of list.slice(0, limit)) {
    if (!item.id || !item.title || !item.absolute_url) continue;
    const desc = item.content_plain?.trim() ? item.content_plain.trim() : htmlToText(item.content_html ?? '');
    out.push({
      providerKey: 'gem',
      sourceId,
      externalId: item.id,
      externalRequisitionId: cleanLine(item.internal_job_id),
      companyName: humanizeSlug(slug),
      employerSlugHint: slug,
      title: cleanLine(item.title) ?? 'Untitled role',
      url: item.absolute_url,
      applyUrl: item.absolute_url,
      descriptionPlain: capText(desc),
      locationRaw: cleanLine(item.location?.name),
      workplaceType: normalizeWorkplace(item.location_type),
      department: cleanLine(item.departments?.[0]?.name),
      employmentType: cleanLine(item.employment_type),
      postedAt: parseIsoTimestampOrNull(item.first_published_at),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Gem board',
    });
  }
  return out;
}

/* ==========================================================================
   9. Polymer (`api.polymer.co/v1/hire/organizations/{slug}/jobs`)
   ========================================================================== */
interface PolymerJob {
  id?: number | string;
  title?: string;
  job_post_url?: string;
  city?: string;
  state_region?: string;
  country?: string;
  remoteness_pretty?: string;
  kind_pretty?: string;
  department?: string;
  description?: string;
  published_at?: string;
}

export function parsePolymerPayload(slug: string, rawJson: string, limit = 500): RadarPostingInput[] {
  const parsed = JSON.parse(rawJson) as { items?: PolymerJob[]; jobs?: PolymerJob[] } | PolymerJob[];
  const list = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.jobs ?? []);
  const sourceId = `polymer:${slug}`;
  const out: RadarPostingInput[] = [];

  for (const job of list.slice(0, limit)) {
    if (job.id == null || !job.title || !job.job_post_url) continue;
    out.push({
      providerKey: 'polymer',
      sourceId,
      externalId: String(job.id),
      companyName: humanizeSlug(slug),
      employerSlugHint: slug,
      title: cleanLine(job.title) ?? 'Untitled role',
      url: job.job_post_url,
      applyUrl: job.job_post_url,
      descriptionPlain: capText(htmlToText(job.description ?? '')),
      locationRaw: cleanLine([job.city, job.state_region, job.country].filter(Boolean).join(', ')),
      city: cleanLine(job.city),
      stateRegion: cleanLine(job.state_region),
      countryCode: cleanLine(job.country),
      workplaceType: normalizeWorkplace(job.remoteness_pretty),
      department: cleanLine(job.department),
      employmentType: cleanLine(job.kind_pretty),
      postedAt: parseIsoTimestampOrNull(job.published_at),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Polymer board',
    });
  }
  return out;
}

/* ==========================================================================
   10. BreezyHR (`{company}.breezy.hr/json`)
   ========================================================================== */
interface BreezyJob {
  id?: string;
  friendly_id?: string;
  name?: string;
  url?: string;
  published_date?: string;
  department?: string;
  description?: string;
  company?: { name?: string };
  type?: { name?: string };
  location?: {
    name?: string;
    city?: string;
    state?: { id?: string; name?: string };
    country?: { id?: string; name?: string };
    is_remote?: boolean;
  };
}

export function parseBreezyPayload(companySlug: string, rawJson: string, limit = 500): RadarPostingInput[] {
  const list = JSON.parse(rawJson) as BreezyJob[];
  if (!Array.isArray(list)) return [];
  const sourceId = `breezy:${companySlug}`;
  const out: RadarPostingInput[] = [];

  for (const job of list.slice(0, limit)) {
    if (!job.id || !job.name || !job.url) continue;
    out.push({
      providerKey: 'breezy',
      sourceId,
      externalId: job.id,
      externalRequisitionId: cleanLine(job.friendly_id),
      companyName: cleanLine(job.company?.name) ?? humanizeSlug(companySlug),
      employerSlugHint: companySlug,
      title: cleanLine(job.name) ?? 'Untitled role',
      url: job.url,
      applyUrl: `${job.url.replace(/\/+$/, '')}/apply`,
      descriptionPlain: capText(htmlToText(job.description ?? '')),
      locationRaw: cleanLine(job.location?.name),
      city: cleanLine(job.location?.city),
      stateRegion: cleanLine(job.location?.state?.id ?? job.location?.state?.name),
      countryCode: cleanLine(job.location?.country?.id ?? job.location?.country?.name),
      workplaceType: normalizeWorkplace(null, job.location?.is_remote),
      department: cleanLine(job.department),
      employmentType: cleanLine(job.type?.name),
      postedAt: parseIsoTimestampOrNull(job.published_date),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public BreezyHR board',
    });
  }
  return out;
}

/* ==========================================================================
   11. Teamtailor Public RSS Feed (`{company}.jobs.teamtailor.com/jobs.rss`)
   ========================================================================== */
export function parseTeamtailorRssPayload(companySlug: string, rawXml: string, limit = 500): RadarPostingInput[] {
  const sourceId = `teamtailor:${companySlug}`;
  const channelTitle = extractXmlTagText(rawXml, 'title');
  const companyName = cleanLine(channelTitle?.replace(/\s*[-|·]\s*(careers|jobs).*$/i, '')) ?? humanizeSlug(companySlug);
  const items = rawXml.split('<item>').slice(1, limit + 1);
  const out: RadarPostingInput[] = [];

  for (const rawItem of items) {
    const endIdx = rawItem.indexOf('</item>');
    const block = endIdx === -1 ? rawItem : rawItem.slice(0, endIdx);

    const title = extractXmlTagText(block, 'title');
    const link = extractXmlTagText(block, 'link');
    const guid = extractXmlTagText(block, 'guid') ?? link;
    if (!title || !link || !guid) continue;

    const description = extractXmlTagText(block, 'description') ?? '';
    const pubDate = extractXmlTagText(block, 'pubDate');
    const remoteStatus = extractXmlTagText(block, 'tt:remoteStatus') ?? extractXmlTagText(block, 'remoteStatus');
    const location = extractXmlTagText(block, 'tt:location') ?? extractXmlTagText(block, 'location');
    const department = extractXmlTagText(block, 'tt:department') ?? extractXmlTagText(block, 'department');

    out.push({
      providerKey: 'teamtailor',
      sourceId,
      externalId: guid,
      companyName,
      employerSlugHint: companySlug,
      title: cleanLine(title) ?? 'Untitled role',
      url: link,
      applyUrl: link,
      descriptionPlain: capText(htmlToText(description)),
      locationRaw: cleanLine(location),
      workplaceType: normalizeWorkplace(remoteStatus),
      department: cleanLine(department),
      postedAt: parseIsoTimestampOrNull(pubDate),
      discoveryOrigin: 'DIRECT_ATS_API',
      attributionText: 'Listing data from the employer public Teamtailor career portal',
    });
  }
  return out;
}

/** Unified dispatcher across all 11 authorized ATS providers. */
export function parseAtsFeedPayload(
  provider: RadarAtsProvider,
  boardToken: string,
  rawBody: string,
  limit = 500,
): RadarPostingInput[] {
  switch (provider) {
    case 'greenhouse':
      return parseGreenhousePayload(boardToken, rawBody, limit);
    case 'lever':
      return parseLeverPayload(boardToken, rawBody, 'us', limit);
    case 'lever_eu':
      return parseLeverPayload(boardToken, rawBody, 'eu', limit);
    case 'ashby':
      return parseAshbyPayload(boardToken, rawBody, limit);
    case 'workable':
      return parseWorkablePayload(boardToken, rawBody, limit);
    case 'recruitee':
      return parseRecruiteePayload(boardToken, rawBody, limit);
    case 'personio':
      return parsePersonioXmlPayload(boardToken, rawBody, limit);
    case 'pinpoint':
      return parsePinpointPayload(boardToken, rawBody, limit);
    case 'gem':
      return parseGemPayload(boardToken, rawBody, limit);
    case 'polymer':
      return parsePolymerPayload(boardToken, rawBody, limit);
    case 'breezy':
      return parseBreezyPayload(boardToken, rawBody, limit);
    case 'teamtailor':
      return parseTeamtailorRssPayload(boardToken, rawBody, limit);
  }
}
