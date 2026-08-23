import { contentHash, inferEmploymentType, inferRemoteType, stripHtml } from '../normalize';
import type { AdapterContext, JobSourceAdapter, NormalizedJob } from '../types';

/**
 * Lever public postings API (api.lever.co/v0/postings). Public JSON API — not scraping.
 * Fixed host; company slug validated to a safe charset (SSRF-safe).
 */
const HOST = 'https://api.lever.co';
const SLUG_RE = /^[a-z0-9_-]+$/i;

interface LeverCategories {
  location?: string;
  commitment?: string;
  level?: string;
  team?: string;
  allLocations?: string[];
}
interface LeverPosting {
  id: string;
  text?: string;
  descriptionPlain?: string;
  description?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number | string;
  categories?: LeverCategories | null;
}

export const leverAdapter: JobSourceAdapter = {
  source: 'lever',

  async discover(ctx: AdapterContext): Promise<NormalizedJob[]> {
    if (!SLUG_RE.test(ctx.board)) throw new Error('INVALID_BOARD');
    const url = `${HOST}/v0/postings/${encodeURIComponent(ctx.board)}?mode=json`;
    const res = await ctx.fetcher(url, { signal: ctx.signal });
    if (!res.ok) throw new Error(`LEVER_HTTP_${res.status}`);
    const payload = (await res.json()) as LeverPosting[];
    const list = Array.isArray(payload) ? payload : [];

    return list.map((p) => {
      const title = String(p.text || '');
      const description = stripHtml(p.descriptionPlain || p.description || '');
      const location = p.categories?.location || '';
      const commitment = p.categories?.commitment || '';
      const id = String(p.id);
      return {
        source: 'lever',
        source_job_id: id,
        canonical_url: String(p.hostedUrl || ''),
        company: ctx.company,
        title,
        description,
        location,
        remote_type: inferRemoteType(location, title, description),
        employment_type: inferEmploymentType(commitment, title, description),
        seniority: p.categories?.level || undefined,
        posted_at:
          typeof p.createdAt === 'number'
            ? new Date(p.createdAt).toISOString()
            : p.createdAt
              ? String(p.createdAt)
              : undefined,
        application_url: String(p.applyUrl || ''),
        metadata: { team: p.categories?.team, commitment, level: p.categories?.level, allLocations: p.categories?.allLocations },
        content_hash: contentHash({ source: 'lever', source_job_id: id, company: ctx.company, title, description }),
      } satisfies NormalizedJob;
    });
  },

  async healthCheck(ctx: AdapterContext) {
    if (!SLUG_RE.test(ctx.board)) return { ok: false, detail: 'INVALID_BOARD' };
    try {
      const res = await ctx.fetcher(`${HOST}/v0/postings/${encodeURIComponent(ctx.board)}?mode=json`, { signal: ctx.signal });
      return { ok: res.ok, detail: res.ok ? undefined : `HTTP_${res.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : 'unknown' };
    }
  },
};
