import { contentHash, inferEmploymentType, inferRemoteType, stripHtml } from '../normalize';
import type { AdapterContext, JobSourceAdapter, NormalizedJob } from '../types';

/**
 * Greenhouse public job-board API (boards-api.greenhouse.io). This is a legitimate
 * public JSON API for career pages — not scraping. The host is fixed, and the board
 * token is validated to a safe charset so it cannot alter the host (SSRF-safe).
 */
const HOST = 'https://boards-api.greenhouse.io';
const BOARD_RE = /^[a-z0-9_-]+$/i;

interface GreenhouseJob {
  id: string | number;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  content?: string;
  location?: { name?: string } | null;
  departments?: unknown[];
}

export const greenhouseAdapter: JobSourceAdapter = {
  source: 'greenhouse',

  async discover(ctx: AdapterContext): Promise<NormalizedJob[]> {
    if (!BOARD_RE.test(ctx.board)) throw new Error('INVALID_BOARD');
    const url = `${HOST}/v1/boards/${encodeURIComponent(ctx.board)}/jobs?content=true`;
    const res = await ctx.fetcher(url, { signal: ctx.signal });
    if (!res.ok) throw new Error(`GREENHOUSE_HTTP_${res.status}`);
    const payload = (await res.json()) as { jobs?: GreenhouseJob[] };
    const list = Array.isArray(payload.jobs) ? payload.jobs : [];

    return list.map((j) => {
      const title = String(j.title || '');
      const description = stripHtml(typeof j.content === 'string' ? j.content : '');
      const location = j.location?.name ? String(j.location.name) : '';
      const postedAt = j.updated_at ? String(j.updated_at) : undefined;
      const id = String(j.id);
      return {
        source: 'greenhouse',
        source_job_id: id,
        canonical_url: String(j.absolute_url || ''),
        company: ctx.company,
        title,
        description,
        location,
        remote_type: inferRemoteType(location, title, description),
        employment_type: inferEmploymentType(title, description),
        posted_at: postedAt,
        application_url: String(j.absolute_url || ''),
        metadata: { departments: j.departments ?? [], updated_at: postedAt },
        content_hash: contentHash({ source: 'greenhouse', source_job_id: id, company: ctx.company, title, description }),
      } satisfies NormalizedJob;
    });
  },

  async healthCheck(ctx: AdapterContext) {
    if (!BOARD_RE.test(ctx.board)) return { ok: false, detail: 'INVALID_BOARD' };
    try {
      const res = await ctx.fetcher(`${HOST}/v1/boards/${encodeURIComponent(ctx.board)}/jobs`, { signal: ctx.signal });
      return { ok: res.ok, detail: res.ok ? undefined : `HTTP_${res.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : 'unknown' };
    }
  },
};
