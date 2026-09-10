import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route auth behavior. Patched routes must return a clean 401
 * (UNAUTHENTICATED) when requireUser() throws instead of leaking a 500,
 * and the shared jobs pool stays publicly readable.
 */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  requestIp: vi.fn(() => '1.2.3.4'),
  limit: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: m.requestIp }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ order: () => ({ limit: m.limit }) }) }) },
}));
vi.mock('@packages/security/entitlements', () => ({ assertEntitlement: vi.fn() }));
vi.mock('@/lib/ai/server', () => ({
  AICredentialMissingError: class extends Error {},
  buildGatewayForUser: vi.fn(),
  createToolMeter: vi.fn(),
}));
vi.mock('@/lib/ai/matching-loader', () => ({ loadMatchInputs: vi.fn() }));
vi.mock('@/lib/matching/engine', () => ({ runMatching: vi.fn() }));
vi.mock('@packages/ai/gateway', () => ({ AIGatewayError: class extends Error {} }));

import { POST as matchPOST } from '@/app/api/ai/match/route';
import { GET as jobsGET } from '@/app/api/jobs/route';

beforeEach(() => {
  vi.clearAllMocks();
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
});

describe('POST /api/ai/match auth', () => {
  it('returns 401 UNAUTHENTICATED instead of 500 when logged out', async () => {
    m.requireUser.mockRejectedValue(new Error('no session'));
    const res = await matchPOST(new Request('http://x/api/ai/match', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('UNAUTHENTICATED');
    expect(m.enforceRateLimit).not.toHaveBeenCalled();
  });
});

describe('GET /api/jobs public pool', () => {
  it('serves the pool without a session', async () => {
    m.limit.mockResolvedValue({ data: [{ id: 'job-1' }], error: null });
    const res = await jobsGET(new Request('http://x/api/jobs'));
    expect(res.status).toBe(200);
    expect((await res.json()).jobs).toEqual([{ id: 'job-1' }]);
    expect(m.requireUser).not.toHaveBeenCalled();
  });

  it('rate-limits anonymous pool reads', async () => {
    m.enforceRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await jobsGET(new Request('http://x/api/jobs'));
    expect(res.status).toBe(429);
    expect(m.limit).not.toHaveBeenCalled();
  });
});
