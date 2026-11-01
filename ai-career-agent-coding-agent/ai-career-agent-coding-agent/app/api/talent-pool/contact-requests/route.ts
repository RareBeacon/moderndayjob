import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-cand-reqs:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('talent_contact_requests')
    .select('*,employer_organizations(id,company_name,website_url,industry,company_location)')
    .eq('candidate_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'REQUESTS_LOAD_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}
