import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * GET /api/admin/analytics/usage - AI usage / cost dashboard data (B-061/B-063).
 * Admin-gated. Aggregates the ai_usage ledger over the last 30 days in JS
 * from a bounded row set: volume by day and feature, error/blocked rates,
 * latency, provider split, top users, and the anonymous share.
 */

interface UsageRow {
  created_at: string;
  feature: string;
  provider: string;
  status: string;
  latency_ms: number | null;
  user_id: string | null;
}

export async function GET(req: Request) {
  const rl = await enforceRateLimit(`admin:analytics:usage:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    await requireAdminUser();
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from('ai_usage')
      .select('created_at,feature,provider,status,latency_ms,user_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20000);

    const rows = (data ?? []) as UsageRow[];
    const day = (iso: string) => iso.slice(0, 10);
    const byDay = new Map<string, { day: string; total: number; errors: number }>();
    const byFeature = new Map<string, { feature: string; total: number; errors: number; latencySum: number }>();
    const byProvider = new Map<string, number>();
    const byUser = new Map<string, number>();
    let total = 0;
    let ok = 0;
    let errored = 0;
    let blocked = 0;
    let latencySum = 0;
    let anonymous = 0;

    for (const r of rows) {
      total += 1;
      if (r.status === 'ok') ok += 1;
      else if (r.status === 'blocked') blocked += 1;
      else errored += 1;
      latencySum += r.latency_ms ?? 0;
      if (!r.user_id) anonymous += 1;

      const d = byDay.get(day(r.created_at)) ?? { day: day(r.created_at), total: 0, errors: 0 };
      d.total += 1;
      if (r.status !== 'ok') d.errors += 1;
      byDay.set(d.day, d);

      const f = byFeature.get(r.feature) ?? { feature: r.feature, total: 0, errors: 0, latencySum: 0 };
      f.total += 1;
      if (r.status !== 'ok') f.errors += 1;
      f.latencySum += r.latency_ms ?? 0;
      byFeature.set(r.feature, f);

      byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + 1);
      if (r.user_id) byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
    }

    const topUsers = [...byUser.entries()]
      .map(([user_id, count]) => ({ user_id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return Response.json({
      windowDays: 30,
      total,
      ok,
      errored,
      blocked,
      errorRate: total ? +(errored / total).toFixed(4) : 0,
      anonymous,
      avgLatencyMs: total ? Math.round(latencySum / total) : 0,
      byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
      byFeature: [...byFeature.values()]
        .map((f) => ({ ...f, avgLatencyMs: f.total ? Math.round(f.latencySum / f.total) : 0, latencySum: undefined }))
        .sort((a, b) => b.total - a.total),
      byProvider: [...byProvider.entries()]
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count),
      topUsers,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
