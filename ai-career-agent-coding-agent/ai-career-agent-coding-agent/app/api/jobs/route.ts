import { NextResponse } from 'next/server';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { findDuplicateIds, isStale } from '@/lib/jobsources/dedup';

/**
 * Lists the shared jobs pool (job browser). Public: listings carry no user
 * data. Freshness + cross-source dedup (B-144/B-145): rows not seen by
 * ingestion within 30 days are hidden, tier-2 duplicates (same listing via
 * two boards) collapse to the earliest row. Nothing is deleted.
 */
export async function GET(req: Request) {
  const rl = await enforceRateLimit(`jobs:list:${requestIp(req)}`, 30, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id,source,company,title,url,location,metadata,created_at,duplicate_key,last_seen_at')
    .order('created_at', { ascending: false })
    .limit(150);
  if (error) return NextResponse.json({ error: 'JOBS_LIST_FAILED' }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const fresh = rows.filter(
    (j) => !isStale({ last_seen_at: (j.last_seen_at as string) ?? null, created_at: (j.created_at as string) ?? null }),
  );
  const duplicateIds = findDuplicateIds(
    fresh.map((j) => ({
      id: String(j.id),
      duplicate_key: (j.duplicate_key as string) ?? null,
      created_at: (j.created_at as string) ?? null,
    })),
  );
  const jobs = fresh
    .filter((j) => !duplicateIds.has(String(j.id)))
    .map((j) => ({
      id: j.id,
      source: j.source,
      company: j.company,
      title: j.title,
      url: j.url,
      location: j.location,
      metadata: j.metadata,
      created_at: j.created_at,
    }))
    .slice(0, 50);
  return NextResponse.json({ jobs });
}
