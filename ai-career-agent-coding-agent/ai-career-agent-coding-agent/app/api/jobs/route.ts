import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/** Strip PostgREST filter syntax from free-text search so the .or() value
 *  can never be reshaped by a caller (commas, parens and colons alter the
 *  filter expression; the API only ever means a plain substring search). */
function sanitizeSearch(value: string): string {
  return value.replace(/[^\p{L}\p{N} .+#&/'-]/gu, '').slice(0, 80);
}

/**
 * Mobile and web job discovery API.
 * Query params:
 *  - q: search keyword for title or company
 *  - location: location keyword
 *  - source: board source filter (greenhouse, lever, ashby, workable, smartrecruiters, etc.)
 *  - page: 1-indexed page number (default 1)
 *  - limit: items per page (default 20, max 50)
 */
export async function GET(req: Request) {
  // Authenticated endpoint: the jobs pool is not a public listing surface
  // (owner decision C-04; the site deliberately publishes no job listings).
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rl = await enforceRateLimit(`jobs:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  try {
    const url = new URL(req.url);
    const q = sanitizeSearch(url.searchParams.get('q')?.trim() || '');
    const location = url.searchParams.get('location')?.trim() || '';
    const source = url.searchParams.get('source')?.trim() || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('jobs')
      .select('id, source, external_id, company, title, url, description, location, metadata, created_at', { count: 'exact' });

    if (q) {
      query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%`);
    }
    if (location) {
      query = query.ilike('location', `%${location}%`);
    }
    if (source) {
      query = query.eq('source', source);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: jobs, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'JOB_SEARCH_FAILED', details: error.message }, { status: 500 });
    }

    // Saved-job markers for the signed-in caller
    let savedJobIds = new Set<string>();

    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map((j) => j.id);
      const { data: saved } = await supabaseAdmin
        .from('saved_jobs')
        .select('job_id')
        .eq('user_id', user.id)
        .in('job_id', jobIds);

      if (saved) {
        savedJobIds = new Set(saved.map((s) => s.job_id));
      }
    }

    const enrichedJobs = (jobs || []).map((j) => ({
      ...j,
      isSaved: savedJobIds.has(j.id),
    }));

    return NextResponse.json({
      jobs: enrichedJobs,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', details: message }, { status: 500 });
  }
}
