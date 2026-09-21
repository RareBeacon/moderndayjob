import { defaultFetchImpl, type FetchLike, type NormalizedJob, type SourceAdapter } from './types';
import { capText, cleanLine, contentHash, htmlToText } from './normalize';

/* ============================================================
   Greenhouse, public board JSON API (no auth for public boards)
   GET https://boards.greenhouse.io/v1/boards/{token}/jobs?content=true
   ============================================================ */
interface GreenhouseJob {
  id: number;
  title?: string;
  updated_at?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string;
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
      const data = await json(`https://boards.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);
      const rows: NormalizedJob[] = [];
      for (const job of (data.jobs ?? []).slice(0, limit)) {
        if (!job.title || !job.absolute_url) continue;
        const description = capText(htmlToText(job.content ?? ''));
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
          },
        });
      }
      return rows;
    },
  };
}

/* ============================================================
   Lever, public postings API
   GET https://api.lever.co/v0/postings/{company}?mode=json
   ============================================================ */
interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  description?: string;
  categories?: { location?: string; commitment?: string; team?: string; department?: string };
  createdAt?: number;
}

export function leverAdapter(company: string, fetchImpl: FetchLike): SourceAdapter {
  return {
    id: `lever:${company}`,
    label: `Lever · ${company}`,
    async fetchBatch(limit) {
      const res = await fetchImpl(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`);
      if (!res.ok) throw new Error(`LEVER_HTTP_${res.status}`);
      const postings = (await res.json()) as LeverPosting[];
      const rows: NormalizedJob[] = [];
      for (const p of postings.slice(0, limit)) {
        if (!p.id || !p.text || !p.hostedUrl) continue;
        const description = capText(p.descriptionPlain && p.descriptionPlain.trim().length > 0 ? p.descriptionPlain : htmlToText(p.description ?? ''));
        rows.push({
          source: 'LEVER',
          external_id: p.id,
          company: cleanLine(company.replace(/[-_]/g, ' ')) ?? company,
          title: cleanLine(p.text) ?? 'Untitled role',
          url: p.hostedUrl,
          description,
          location: cleanLine([p.categories?.location, p.categories?.commitment].filter(Boolean).join(' · ')),
          metadata: {
            contentHash: await contentHash([company, p.text, p.categories?.location, description]),
            team: cleanLine(p.categories?.team),
            postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
          },
        });
      }
      return rows;
    },
  };
}

/* ============================================================
   Ashby, public posting API
   GET https://api.ashbyhq.com/posting-api/job-board/{org}
   ============================================================ */
interface AshbyJob {
  id?: string;
  title?: string;
  jobUrl?: string;
  location?: string;
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
      const res = await fetchImpl(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`);
      if (!res.ok) throw new Error(`ASHBY_HTTP_${res.status}`);
      const data = (await res.json()) as { jobs?: AshbyJob[] };
      const rows: NormalizedJob[] = [];
      for (const job of (data.jobs ?? []).slice(0, limit)) {
        if (!job.id || !job.title || !job.jobUrl) continue;
        const description = capText(htmlToText(job.description ?? ''));
        const location = cleanLine(
          [job.location, job.isRemote ? 'Remote' : null, ...(job.secondaryLocations ?? []).map((l) => l.location ?? '')].filter(Boolean).join(' · '),
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
   GET https://apply.workable.com/api/v1/widget/accounts/{account}
   Verified live 2026-09-21 (quickhirestaffing: 118 postings).
   The widget response carries no description text; matching relies on
   title/location and the content hash covers the stable fields.
   ============================================================ */
interface WorkableJob {
  title?: string;
  url?: string;
  shortcode?: string;
  city?: string;
  state?: string;
  country?: string;
  telecommuting?: boolean;
  published_on?: string;
}

export function workableAdapter(account: string, fetchImpl: FetchLike): SourceAdapter {
  return {
    id: `workable:${account}`,
    label: `Workable · ${account}`,
    async fetchBatch(limit) {
      const res = await fetchImpl(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}`);
      if (!res.ok) throw new Error(`WORKABLE_HTTP_${res.status}`);
      const data = (await res.json()) as { jobs?: WorkableJob[] };
      const rows: NormalizedJob[] = [];
      for (const job of (data.jobs ?? []).slice(0, limit)) {
        if (!job.title || !job.url) continue;
        const location = cleanLine([job.city, job.state, job.country].filter(Boolean).join(', '));
        rows.push({
          source: 'WORKABLE',
          external_id: job.shortcode ?? job.url,
          company: cleanLine(account.replace(/[-_]/g, ' ')) ?? account,
          title: cleanLine(job.title) ?? 'Untitled role',
          url: job.url,
          description: '',
          location,
          metadata: {
            contentHash: await contentHash([account, job.title, location]),
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
   SmartRecruiters, public postings API (no auth)
   GET https://api.smartrecruiters.com/v1/companies/{companyId}/postings
   Verified live 2026-09-21 (BoschGroup: 4,801 postings).
   NOTE: source support only for now. The application form lives behind
   SmartRecruiters' oneclick-ui SPA, which renders an empty body to
   headless browsers (observed 2026-09-21), so no apply adapter is
   shipped until the form can be verified with the real browser worker.
   No registry rows exist for this adapter yet; enable later with one
   job_sources insert per company.
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
        const location = cleanLine(job.location?.fullLocation ?? [job.location?.city, job.location?.country].filter(Boolean).join(', '));
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
   Board registry, remote-first curation verified live 2026-09-10;
   env-overridable. Boards below all returned live postings on that date.
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
export function defaultAdapters(env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = defaultFetchImpl()): SourceAdapter[] {
  return [
    ...csv(env.JOB_SOURCE_GREENHOUSE_BOARDS, DEFAULT_GREENHOUSE_BOARDS).map((t) => greenhouseAdapter(t, fetchImpl)),
    ...csv(env.JOB_SOURCE_LEVER_BOARDS, DEFAULT_LEVER_BOARDS).map((c) => leverAdapter(c, fetchImpl)),
    ...csv(env.JOB_SOURCE_ASHBY_BOARDS, DEFAULT_ASHBY_BOARDS).map((o) => ashbyAdapter(o, fetchImpl)),
    ...csv(env.JOB_SOURCE_WORKABLE_BOARDS, DEFAULT_WORKABLE_BOARDS).map((a) => workableAdapter(a, fetchImpl)),
  ];
}
