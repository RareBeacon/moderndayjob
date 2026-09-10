import { NextResponse } from 'next/server';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';

/** Lists the shared, de-duplicated jobs pool (job browser). Public: listings carry no user data. */
export async function GET(req: Request) {
  const rl = await enforceRateLimit(`jobs:list:${requestIp(req)}`, 30, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id,source,company,title,url,location,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'JOBS_LIST_FAILED' }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}
