import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { supabaseAdmin } from '@/lib/supabase';
import { hashIp } from '@/lib/ai/usage';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

/** Shared Redis client (null when Upstash is not configured). */
export function getRedis() {
  return redis;
}

/** Rate-limit trips feed the security digest (Phase 2, §10.3 "Security"). */
async function noteRateLimitTrip(key: string, ip?: string): Promise<void> {
  try {
    // Keep the route context but drop any raw IP embedded in the key.
    const safeKey = key.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>');
    await supabaseAdmin.from('security_events').insert({
      event_type: 'RATE_LIMIT_TRIP',
      severity: 'WARN',
      ip_hash: ip ? hashIp(ip) : null,
      metadata: { key: safeKey.slice(0, 120) },
    });
  } catch {
    /* never fail a 429 because of the trip log */
  }
}

/**
 * Enforce a sliding-window limit. Pass `ip` on IP-keyed limits (signup, jobs,
 * free tools) so the trip lands in security_events with its hashed IP; the
 * trip insert is best-effort and never blocks the 429 itself.
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  window: '1 m' | '1 h' | '1 d' = '1 m',
  ip?: string,
) {
  if (!redis) return { allowed: true, remaining: limit };
  const rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window), analytics: true, prefix: 'aca' });
  const r = await rl.limit(key);
  if (!r.success) void noteRateLimitTrip(key, ip);
  return { allowed: r.success, remaining: r.remaining };
}

export function requestIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}
