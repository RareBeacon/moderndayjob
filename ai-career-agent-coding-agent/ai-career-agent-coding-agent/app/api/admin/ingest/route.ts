import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { defaultAdapters } from '@/lib/jobsources/boards';
import { runIngestion } from '@/lib/jobsources/ingest';
import { supabaseJobStore } from '@/lib/jobsources/store';

const body = z.object({
  /** Optional explicit board lists; defaults come from env/registry. */
  greenhouse: z.array(z.string().min(1).max(60)).max(10).optional(),
  lever: z.array(z.string().min(1).max(60)).max(10).optional(),
  ashby: z.array(z.string().min(1).max(60)).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const maxDuration = 60;

/**
 * POST /api/admin/ingest — run job source adapters and upsert real listings
 * into the pool. Admin-gated. Each board is error-isolated: failures are
 * reported, never thrown. This is the manual trigger the scheduler/agent
 * workers also use for daily JOB_DISCOVERY tasks.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const { greenhouse, lever, ashby, limit } = parsed.data;

  const adapters = defaultAdapters({
    ...(greenhouse ? { JOB_SOURCE_GREENHOUSE_BOARDS: greenhouse.join(',') } : {}),
    ...(lever ? { JOB_SOURCE_LEVER_BOARDS: lever.join(',') } : {}),
    ...(ashby ? { JOB_SOURCE_ASHBY_BOARDS: ashby.join(',') } : {}),
  } as NodeJS.ProcessEnv);

  const report = await runIngestion({ adapters, store: supabaseJobStore, limit });
  return NextResponse.json({ report });
}
