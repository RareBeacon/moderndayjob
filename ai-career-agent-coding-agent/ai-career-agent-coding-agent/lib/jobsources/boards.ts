import { defaultFetchImpl, type FetchLike, type NormalizedJob, type SourceAdapter } from './types';
import { capText, cleanLine, contentHash, htmlToText } from './normalize';

/* ============================================================
   Greenhouse — public board JSON API (no auth for public boards)
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
   Lever — public postings API
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
   Ashby — public posting API
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
   Board registry — defaults verified live 2026-09-02; env-overridable.
   ============================================================ */
export const DEFAULT_GREENHOUSE_BOARDS = 'stripe,airbnb,dropbox';
export const DEFAULT_LEVER_BOARDS = 'spotify';
export const DEFAULT_ASHBY_BOARDS = 'ashby,ramp';

function csv(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/** Build adapters from env (or defaults). Order: greenhouse, lever, ashby. */
export function defaultAdapters(env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = defaultFetchImpl()): SourceAdapter[] {
  return [
    ...csv(env.JOB_SOURCE_GREENHOUSE_BOARDS, DEFAULT_GREENHOUSE_BOARDS).map((t) => greenhouseAdapter(t, fetchImpl)),
    ...csv(env.JOB_SOURCE_LEVER_BOARDS, DEFAULT_LEVER_BOARDS).map((c) => leverAdapter(c, fetchImpl)),
    ...csv(env.JOB_SOURCE_ASHBY_BOARDS, DEFAULT_ASHBY_BOARDS).map((o) => ashbyAdapter(o, fetchImpl)),
  ];
}
