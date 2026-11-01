import { defaultFetchImpl, type FetchLike, type NormalizedJob, type SourceAdapter } from './types';
import { capText, cleanLine, contentHash, htmlToText } from './normalize';
import {
  buildAtsBoardEndpointUrl,
  parseAtsFeedPayload,
  type RadarAtsProvider,
} from '../radar/adapters/ats';

/* ============================================================
   Greenhouse, public board JSON API (no auth for public boards)
   GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true&pay_transparency=true
   ============================================================ */
interface GreenhouseJob {
  id: number;
  title?: string;
  updated_at?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string;
  pay_input_ranges?: Array<{
    min_cents?: number | null;
    max_cents?: number | null;
    currency_type?: string | null;
  }>;
  metadata?: unknown;
}

export function greenhouseAdapter(token: string, fetchImpl: FetchLike): SourceAdapter {
  const json = async (url: string) => {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`GREENHOUSE_HTTP_${res.status}`);
    return (await res.json()) as { jobs?: GreenhouseJob[] };
  };
  return {
    id: `greenhouse:${token}`,
    label: `Greenhouse · ${token}`,
    async fetchBatch(limit) {
      const data = await json(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true&pay_transparency=true`,
      );
      const rows: NormalizedJob[] = [];
      for (const job of (data.jobs ?? []).slice(0, limit)) {
        if (!job.title || !job.absolute_url) continue;
        const description = capText(htmlToText(job.content ?? ''));
        const payRange = job.pay_input_ranges?.[0];
        rows.push({
          source: 'GREENHOUSE',
          external_id: String(job.id),
          company: cleanLine(token.replace(/[-_]/g, ' ')) ?? token,
          title: cleanLine(job.title) ?? 'Untitled role',
          url: job.absolute_url,
          description,
          location: cleanLine(job.location?.name),
          metadata: {
            contentHash: await contentHash([token, job.title, job.location?.name, description]),
            boardToken: token,
            updatedAt: job.updated_at ?? null,
            ...(payRange
              ? {
                  salaryMin: typeof payRange.min_cents === 'number' ? payRange.min_cents / 100 : null,
                  salaryMax: typeof payRange.max_cents === 'number' ? payRange.max_cents / 100 : null,
                  salaryCurrency: payRange.currency_type ?? null,
                }
              : {}),
          },
        });
      }
      return rows;
    },
  };
}

/* ============================================================
   Lever, public postings API (US & EU)
   GET https://api.lever.co/v0/postings/{company}?mode=json
   GET https://api.eu.lever.co/v0/postings/{company}?mode=json
   ============================================================ */
interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  workplaceType?: string;
  descriptionPlain?: string;
  description?: string;
  categories?: { location?: string; commitment?: string; team?: string; department?: string };
  createdAt?: number;
}

export function leverAdapter(company: string, fetchImpl: FetchLike, region: 'us' | 'eu' = 'us'): SourceAdapter {
  const host = region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
  const idPrefix = region === 'eu' ? 'lever_eu' : 'lever';
  const sourceTag = region === 'eu' ? 'LEVER_EU' : 'LEVER';
  return {
    id: `${idPrefix}:${company}`,
    label: `Lever${region === 'eu' ? ' EU' : ''} · ${company}`,
    async fetchBatch(limit) {
      const res = await fetchImpl(`https://${host}/v0/postings/${encodeURIComponent(company)}?mode=json`);
      if (!res.ok) throw new Error(`LEVER_HTTP_${res.status}`);
      const postings = (await res.json()) as LeverPosting[];
      const rows: NormalizedJob[] = [];
      for (const p of postings.slice(0, limit)) {
        if (!p.id || !p.text || !p.hostedUrl) continue;
        const description = capText(
          p.descriptionPlain && p.descriptionPlain.trim().length > 0
            ? p.descriptionPlain
            : htmlToText(p.description ?? ''),
        );
        rows.push({
          source: sourceTag,
          external_id: p.id,
          company: cleanLine(company.replace(/[-_]/g, ' ')) ?? company,
          title: cleanLine(p.text) ?? 'Untitled role',
          url: p.hostedUrl,
          description,
          location: cleanLine([p.categories?.location, p.categories?.commitment].filter(Boolean).join(' · ')),
          metadata: {
            contentHash: await contentHash([company, p.text, p.categories?.location, description]),
            team: cleanLine(p.categories?.team),
            workplaceType: p.workplaceType ?? null,
            postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
          },
        });
      }
      return rows;
    },
  };
}

export function leverEuAdapter(company: string, fetchImpl: FetchLike): SourceAdapter {
  return leverAdapter(company, fetchImpl, 'eu');
}

/* ============================================================
   Ashby, public posting API
   GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
   ============================================================ */
interface AshbyJob {
  id?: string;
  title?: string;
  jobUrl?: string;
  location?: string;
  workplaceType?: string;
  secondaryLocations?: Array<{ location?: string }>;
  department?: string;
  isRemote?: boolean;
  description?: string;
  publishedAt?: string;
}

export function ashbyAdapter(org: string, fetchImpl: FetchLike): SourceAdapter {
  return {
    id: `ashby:${org}`,
    label: `Ashby · ${org}`,
    async fetchBatch(limit) {
      const res = await fetchImpl(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`,
      );
      if (!res.ok) throw new Error(`ASHBY_HTTP_${res.status}`);
      const data = (await res.json()) as { jobs?: AshbyJob[] };
      const rows: NormalizedJob[] = [];
      for (const job of (data.jobs ?? []).slice(0, limit)) {
        if (!job.id || !job.title || !job.jobUrl) continue;
        const description = capText(htmlToText(job.description ?? ''));
        const workplaceBadge = job.workplaceType
          ? /^hybrid$/i.test(job.workplaceType)
            ? 'Hybrid'
            : /^remote$/i.test(job.workplaceType)
              ? 'Remote'
              : null
          : job.isRemote
            ? 'Remote'
            : null;
        const location = cleanLine(
          [job.location, workplaceBadge, ...(job.secondaryLocations ?? []).map((l) => l.location ?? '')]
            .filter(Boolean)
            .join(' · '),
        );
        rows.push({
          source: 'ASHBY',
          external_id: job.id,
          company: cleanLine(org.replace(/[-_]/g, ' ')) ?? org,
          title: cleanLine(job.title) ?? 'Untitled role',
          url: job.jobUrl,
          description,
          location,
          metadata: {
            contentHash: await contentHash([org, job.title, location, description]),
            department: cleanLine(job.department),
            workplaceType: job.workplaceType ?? null,
            publishedAt: job.publishedAt ?? null,
          },
        });
      }
      return rows;
    },
  };
}

/* ============================================================
   Workable, public widget API (no auth for public boards)
   GET https://apply.workable.com/api/v1/widget/accounts/{account}?details=true
   ============================================================ */
interface WorkableJob {
  title?: string;
  url?: string;
  shortcode?: string;
  city?: string;
  state?: string;
  country?: string;
  telecommuting?: boolean;
  description?: string;
  requirements?: string;
  benefits?: string;
  published_on?: string;
}

export function workableAdapter(account: string, fetchImpl: FetchLike): SourceAdapter {
  return {
    id: `workable:${account}`,
    label: `Workable · ${account}`,
    async fetchBatch(limit) {
      const res = await fetchImpl(
        `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`,
      );
      if (!res.ok) throw new Error(`WORKABLE_HTTP_${res.status}`);
      const data = (await res.json()) as { jobs?: WorkableJob[] };
      const rows: NormalizedJob[] = [];
      for (const job of (data.jobs ?? []).slice(0, limit)) {
        if (!job.title || !job.url) continue;
        const location = cleanLine([job.city, job.state, job.country].filter(Boolean).join(', '));
        const description = capText(
          [job.description, job.requirements, job.benefits]
            .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
            .map((part) => htmlToText(part))
            .join('\n\n'),
        );
        rows.push({
          source: 'WORKABLE',
          external_id: job.shortcode ?? job.url,
          company: cleanLine(account.replace(/[-_]/g, ' ')) ?? account,
          title: cleanLine(job.title) ?? 'Untitled role',
          url: job.url,
          description,
          location,
          metadata: {
            contentHash: await contentHash([account, job.title, location, description]),
            telecommuting: job.telecommuting ?? false,
            publishedAt: job.published_on ?? null,
          },
        });
      }
      return rows;
    },
  };
}

/* ============================================================
   SmartRecruiters, public postings API
   NOTE: Held disabled by default in radar_provider_policies until
   partner credentials or explicit robots/terms clearance is recorded.
   ============================================================ */
interface SmartRecruitersPosting {
  id?: string;
  name?: string;
  releasedDate?: string;
  company?: { identifier?: string; name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean; fullLocation?: string };
}

export function smartrecruitersAdapter(companyId: string, fetchImpl: FetchLike): SourceAdapter {
  return {
    id: `smartrecruiters:${companyId}`,
    label: `SmartRecruiters · ${companyId}`,
    async fetchBatch(limit) {
      const res = await fetchImpl(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?limit=${Math.min(limit, 100)}`,
      );
      if (!res.ok) throw new Error(`SMARTRECRUITERS_HTTP_${res.status}`);
      const data = (await res.json()) as { content?: SmartRecruitersPosting[] };
      const rows: NormalizedJob[] = [];
      for (const job of (data.content ?? []).slice(0, limit)) {
        if (!job.id || !job.name) continue;
        const location = cleanLine(
          job.location?.fullLocation ?? [job.location?.city, job.location?.country].filter(Boolean).join(', '),
        );
        rows.push({
          source: 'SMARTRECRUITERS',
          external_id: job.id,
          company: cleanLine(job.company?.name ?? companyId) ?? companyId,
          title: cleanLine(job.name) ?? 'Untitled role',
          url: `https://jobs.smartrecruiters.com/${encodeURIComponent(companyId)}/${encodeURIComponent(job.id)}`,
          description: '',
          location,
          metadata: {
            contentHash: await contentHash([companyId, job.id, job.name, location]),
            remote: job.location?.remote ?? false,
            hybrid: job.location?.hybrid ?? false,
            releasedAt: job.releasedDate ?? null,
          },
        });
      }
      return rows;
    },
  };
}

/* ============================================================
   Phase 2 Expanded Public ATS Source Adapters (Recruitee, Personio,
   Pinpoint, Gem, Polymer, BreezyHR, Teamtailor)
   ============================================================ */
function buildRadarBackedAdapter(
  provider: Extract<
    RadarAtsProvider,
    'recruitee' | 'personio' | 'pinpoint' | 'gem' | 'polymer' | 'breezy' | 'teamtailor'
  >,
  sourceTag: NormalizedJob['source'],
  labelPrefix: string,
  boardToken: string,
  fetchImpl: FetchLike,
): SourceAdapter {
  return {
    id: `${provider}:${boardToken}`,
    label: `${labelPrefix} · ${boardToken}`,
    async fetchBatch(limit) {
      const res = await fetchImpl(buildAtsBoardEndpointUrl(provider, boardToken));
      if (!res.ok) throw new Error(`${sourceTag}_HTTP_${res.status}`);
      const rawBody = await res.text();
      const parsed = parseAtsFeedPayload(provider, boardToken, rawBody, limit);
      const rows: NormalizedJob[] = [];
      for (const p of parsed) {
        rows.push({
          source: sourceTag,
          external_id: p.externalId,
          company: p.companyName,
          title: p.title,
          url: p.url,
          description: p.descriptionPlain,
          location: p.locationRaw,
          metadata: {
            contentHash: await contentHash([boardToken, p.title, p.locationRaw, p.descriptionPlain]),
            workplaceType: p.workplaceType,
            department: p.department ?? null,
            postedAt: p.postedAt ?? null,
          },
        });
      }
      return rows;
    },
  };
}

export const recruiteeAdapter = (slug: string, fetchImpl: FetchLike): SourceAdapter =>
  buildRadarBackedAdapter('recruitee', 'RECRUITEE', 'Recruitee', slug, fetchImpl);

export const personioAdapter = (company: string, fetchImpl: FetchLike): SourceAdapter =>
  buildRadarBackedAdapter('personio', 'PERSONIO', 'Personio', company, fetchImpl);

export const pinpointAdapter = (subdomain: string, fetchImpl: FetchLike): SourceAdapter =>
  buildRadarBackedAdapter('pinpoint', 'PINPOINT', 'Pinpoint', subdomain, fetchImpl);

export const gemAdapter = (slug: string, fetchImpl: FetchLike): SourceAdapter =>
  buildRadarBackedAdapter('gem', 'GEM', 'Gem', slug, fetchImpl);

export const polymerAdapter = (slug: string, fetchImpl: FetchLike): SourceAdapter =>
  buildRadarBackedAdapter('polymer', 'POLYMER', 'Polymer', slug, fetchImpl);

export const breezyAdapter = (company: string, fetchImpl: FetchLike): SourceAdapter =>
  buildRadarBackedAdapter('breezy', 'BREEZY', 'BreezyHR', company, fetchImpl);

export const teamtailorAdapter = (company: string, fetchImpl: FetchLike): SourceAdapter =>
  buildRadarBackedAdapter('teamtailor', 'TEAMTAILOR', 'Teamtailor', company, fetchImpl);

/* ============================================================
   Board registry defaults (env-overridable)
   ============================================================ */
export const DEFAULT_GREENHOUSE_BOARDS = 'gitlab,anthropic,coinbase';
export const DEFAULT_LEVER_BOARDS = 'spotify';
export const DEFAULT_ASHBY_BOARDS = 'openai,linear';
export const DEFAULT_WORKABLE_BOARDS = 'quickhirestaffing';

function csv(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/** Build adapters from env (or defaults). Order: greenhouse, lever, ashby, workable. */
export function defaultAdapters(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = defaultFetchImpl(),
): SourceAdapter[] {
  return [
    ...csv(env.JOB_SOURCE_GREENHOUSE_BOARDS, DEFAULT_GREENHOUSE_BOARDS).map((t) => greenhouseAdapter(t, fetchImpl)),
    ...csv(env.JOB_SOURCE_LEVER_BOARDS, DEFAULT_LEVER_BOARDS).map((c) => leverAdapter(c, fetchImpl)),
    ...csv(env.JOB_SOURCE_ASHBY_BOARDS, DEFAULT_ASHBY_BOARDS).map((o) => ashbyAdapter(o, fetchImpl)),
    ...csv(env.JOB_SOURCE_WORKABLE_BOARDS, DEFAULT_WORKABLE_BOARDS).map((a) => workableAdapter(a, fetchImpl)),
  ];
}
