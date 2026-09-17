import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * Saved jobs (mobile-first capability, backward-compatible addition).
 * GET    -> the user's saved jobs, newest first, with the job fields shown
 *           in the job browser (jobs carry no user data).
 * PUT    -> save a job (idempotent).
 * DELETE -> remove a saved job (idempotent).
 * All access is service-role through this route; the table has RLS and no
 * client policies, same pattern as support_messages.
 */

const JOB_COLUMNS = 'id,source,company,title,url,location,metadata,created_at';

export async function GET(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from('saved_jobs')
    .select(`created_at,jobs(${JOB_COLUMNS})`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: 'SAVED_JOBS_FAILED' }, { status: 500 });
  const jobs = (data ?? []).flatMap((row) => {
    const job = (row as { jobs?: unknown[] | Record<string, unknown> | null }).jobs;
    if (Array.isArray(job)) return job.map((j) => ({ ...(j as Record<string, unknown>), saved_at: (row as { created_at: string }).created_at }));
    return job ? [{ ...(job as Record<string, unknown>), saved_at: (row as { created_at: string }).created_at }] : [];
  });
  return NextResponse.json({ jobs });
}

export async function PUT(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rl = await enforceRateLimit(`saved-put:${requestIp(req)}:${user.id}`, 30, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const parsed = z.object({ jobId: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  // Validate the job exists before saving a reference to it.
  const { data: job } = await supabaseAdmin.from('jobs').select('id').eq('id', parsed.data.jobId).maybeSingle();
  if (!job) return NextResponse.json({ error: 'JOB_NOT_FOUND' }, { status: 404 });
  const { error } = await supabaseAdmin
    .from('saved_jobs')
    .upsert({ user_id: user.id, job_id: parsed.data.jobId }, { onConflict: 'user_id,job_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'SAVE_FAILED' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const parsed = z.object({ jobId: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  const { error } = await supabaseAdmin
    .from('saved_jobs')
    .delete()
    .eq('user_id', user.id)
    .eq('job_id', parsed.data.jobId);
  if (error) return NextResponse.json({ error: 'UNSAVE_FAILED' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
