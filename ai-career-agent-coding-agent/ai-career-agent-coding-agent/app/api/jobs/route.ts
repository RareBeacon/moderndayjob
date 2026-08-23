import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/** Lists the shared, de-duplicated jobs pool (job browser). Auth required. */
export async function GET() {
  await requireUser();
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id,source,company,title,url,location,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'JOBS_LIST_FAILED' }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}
