import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/plans · the public plan-cards endpoint that keeps the website and
 * the mobile app on one source of pricing truth. Rate-limited, cacheable,
 * no auth (the pricing page is public). Must return exactly the four plans
 * in canonical order with prices matching subscription_plans.
 */

const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  requestIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: m.requestIp }));

import { GET } from '@/app/api/plans/route';

function req() {
  return new Request('http://x/api/plans');
}

beforeEach(() => {
  vi.clearAllMocks();
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 59 });
});

describe('GET /api/plans', () => {
  it('returns the four plans in canonical order', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans.map((p: { code: string }) => p.code)).toEqual(['FREE', 'BASIC', 'PREMIUM', 'MAX']);
  });

  it('prices match the subscription_plans amounts (0 / 5000 / 10000 / 20000)', async () => {
    const body = await (await GET(req())).json();
    const byCode = Object.fromEntries(body.plans.map((p: { code: string; monthlyNgn: number }) => [p.code, p.monthlyNgn]));
    expect(byCode.FREE).toBe(0);
    expect(byCode.BASIC).toBe(5000);
    expect(byCode.PREMIUM).toBe(10000);
    expect(byCode.MAX).toBe(20000);
  });

  it('includes the feature lists used by the app plan cards', async () => {
    const body = await (await GET(req())).json();
    for (const plan of body.plans) {
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
      expect(typeof plan.cta).toBe('string');
    }
  });

  it('is rate limited', async () => {
    m.enforceRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('RATE_LIMITED');
  });

  it('sends public cache headers', async () => {
    const res = await GET(req());
    expect(res.headers.get('cache-control')).toContain('public');
  });
});
