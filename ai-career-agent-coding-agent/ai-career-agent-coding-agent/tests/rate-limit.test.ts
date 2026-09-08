import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * Rate-limit identity + wiring (Phase 9). Rate limits key on the client IP;
 * requestIp must parse proxy headers deterministically, and enforceRateLimit
 * must fail OPEN (never block) when Upstash is not configured while still
 * delegating to the sliding-window limiter with the right args when it is.
 */

describe('requestIp (rate-limit identity)', () => {
  it('takes the first, trimmed x-forwarded-for entry', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8 ' } });
    expect(requestIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } });
    expect(requestIp(req)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip when x-forwarded-for is blank', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '   ', 'x-real-ip': '8.8.8.8' } });
    expect(requestIp(req)).toBe('8.8.8.8');
  });

  it("returns 'unknown' when no IP header is present", () => {
    expect(requestIp(new Request('http://x'))).toBe('unknown');
  });
});

describe('enforceRateLimit (fail-open default)', () => {
  it('never blocks when Upstash is not configured (local dev)', async () => {
    // vitest config does not set UPSTASH_* ⇒ the module's Redis client is null.
    await expect(enforceRateLimit('some-key', 3)).resolves.toEqual({ allowed: true, remaining: 3 });
  });
});

describe('enforceRateLimit (Upstash configured)', () => {
  const { limit, slidingWindow } = vi.hoisted(() => ({
    limit: vi.fn(),
    slidingWindow: vi.fn().mockReturnValue({}),
  }));
  let mod: typeof import('@/lib/rate-limit');

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: Object.assign(
        class Ratelimit {
          limit = limit;
        },
        { slidingWindow },
      ),
    }));
    vi.doMock('@upstash/redis', () => ({ Redis: class {} }));
    mod = await import('@/lib/rate-limit');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('delegates to the sliding-window limiter with the right limit/window and maps success', async () => {
    limit.mockResolvedValue({ success: true, remaining: 4 });
    const r = await mod.enforceRateLimit('client-ip', 5, '1 h');
    expect(r).toEqual({ allowed: true, remaining: 4 });
    expect(limit).toHaveBeenCalledWith('client-ip');
    expect(slidingWindow).toHaveBeenCalledWith(5, '1 h');
  });

  it('maps an exhausted window to allowed:false', async () => {
    limit.mockResolvedValue({ success: false, remaining: 0 });
    const r = await mod.enforceRateLimit('client-ip', 2); // default window '1 m'
    expect(r).toEqual({ allowed: false, remaining: 0 });
    expect(slidingWindow).toHaveBeenCalledWith(2, '1 m');
  });
});
