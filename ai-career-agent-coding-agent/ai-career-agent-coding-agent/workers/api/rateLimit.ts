/**
 * Fixed-window rate limiter, in-memory per key. Deliberately dependency-free:
 * the gateway runs on a single Oracle Always Free VM serving ~100 tenants, so
 * a process-local counter is both correct and sufficient (a second instance
 * would need Redis, which the web app already has via Upstash if we ever
 * scale out).
 */
export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets (only meaningful when !allowed). */
  retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string): RateLimitDecision;
}

export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; start: number }>();

  return {
    check(key: string): RateLimitDecision {
      const now = Date.now();
      const current = hits.get(key);

      if (!current || now - current.start >= windowMs) {
        hits.set(key, { count: 1, start: now });
        return { allowed: true, retryAfterSec: 0 };
      }

      current.count += 1;
      if (current.count > max) {
        const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - current.start)) / 1000));
        return { allowed: false, retryAfterSec };
      }
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}
