import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { z } from 'zod';

const saveJobSchema = z.object({
  jobId: z.string().uuid(),
});

/**
 * List saved jobs for authenticated user.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const rl = await enforceRateLimit(`saved-jobs:${requestIp(req)}:${user.id}`, 60, '1 m');
    if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const { data: saved, error } = await supabaseAdmin
      .from('saved_jobs')
      .select('job_id, created_at, jobs(id, source, company, title, url, description, location, metadata, created_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('saved-jobs fetch failed', { userId: user.id, code: error.code });
      return NextResponse.json({ error: 'SAVED_JOBS_FETCH_FAILED' }, { status: 500 });
    }

    const savedJobs = (saved || []).map((s) => ({
      savedAt: s.created_at,
      job: s.jobs,
    }));

    return NextResponse.json({ savedJobs });
  } catch (err: unknown) {
    console.error('saved-jobs route error', { err: String(err).slice(0, 300) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

/**
 * Save a job for authenticated user.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const rl = await enforceRateLimit(`saved-jobs:${requestIp(req)}:${user.id}`, 60, '1 m');
    if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const body = await req.json().catch(() => null);
    const parsed = saveJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_JOB_ID', issues: parsed.error.issues }, { status: 400 });
    }

    const jobId = parsed.data.jobId;

    // The job must exist. A stale id from the client (list refreshed, job
    // garbage-collected) would otherwise surface as a raw foreign-key 500
    // that also leaked the SQL error text. Answer a clean 404 instead.
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: 'JOB_NOT_FOUND' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('saved_jobs')
      .upsert({ user_id: user.id, job_id: jobId }, { onConflict: 'user_id,job_id' });

    if (error) {
      // The job can vanish between the check above and the upsert (race);
      // the FK violation then means the same thing: job no longer exists.
      if (error.code === '23503') {
        return NextResponse.json({ error: 'JOB_NOT_FOUND' }, { status: 404 });
      }
      console.error('saved-jobs upsert failed', { userId: user.id, code: error.code });
      return NextResponse.json({ error: 'SAVE_JOB_FAILED' }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobId });
  } catch (err: unknown) {
    console.error('saved-jobs route error', { err: String(err).slice(0, 300) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

/**
 * Remove a saved job for authenticated user.
 */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const rl = await enforceRateLimit(`saved-jobs:${requestIp(req)}:${user.id}`, 60, '1 m');
    if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const url = new URL(req.url);
    let jobId = url.searchParams.get('jobId');

    if (!jobId) {
      const body = await req.json().catch(() => null);
      jobId = body?.jobId;
    }

    if (!jobId) {
      return NextResponse.json({ error: 'JOB_ID_REQUIRED' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('saved_jobs')
      .delete()
      .eq('user_id', user.id)
      .eq('job_id', jobId);

    if (error) {
      console.error('saved-jobs delete failed', { userId: user.id, code: error.code });
      return NextResponse.json({ error: 'DELETE_SAVED_JOB_FAILED' }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobId });
  } catch (err: unknown) {
    console.error('saved-jobs route error', { err: String(err).slice(0, 300) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
