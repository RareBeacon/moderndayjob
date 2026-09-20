import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route auth behavior. Patched routes must return a clean 401
 * (UNAUTHENTICATED) when requireUser() throws instead of leaking a 500.
 * The retired public jobs pool (/api/jobs, /api/ai/match) was removed with
 * the listings feature (2026-09-20); its auth contract coverage moved to
 * the user-supplied target route, which must never leak a listings pool.
 */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  requestIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: m.enforceRateLimit, requestIp: m.requestIp }));
vi.mock('@/lib/audit', () => ({ auditEvent: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/applications/service', () => ({
  AppActionError: class extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
  prepareApplication: vi.fn(),
}));

import { POST as targetPOST } from '@/app/api/applications/target/route';

beforeEach(() => {
  vi.clearAllMocks();
  m.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
});

describe('POST /api/applications/target auth', () => {
  it('returns 401 UNAUTHENTICATED instead of 500 when logged out', async () => {
    m.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const res = await targetPOST(new Request('http://x/api/applications/target', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('UNAUTHENTICATED');
    expect(m.enforceRateLimit).not.toHaveBeenCalled();
  });

  it('rate-limits bursts before any write', async () => {
    m.requireUser.mockResolvedValue({ id: 'u1', email: 'u1@jobiest.com' });
    m.enforceRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await targetPOST(
      new Request('http://x/api/applications/target', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://boards.greenhouse.io/x', title: 'Eng', company: 'Acme' }),
      }),
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('RATE_LIMITED');
  });

  it('rejects non-public job links (SSRF guard) with 400', async () => {
    m.requireUser.mockResolvedValue({ id: 'u1', email: 'u1@jobiest.com' });
    const res = await targetPOST(
      new Request('http://x/api/applications/target', {
        method: 'POST',
        body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data', title: 'Eng', company: 'Acme' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_JOB_URL');
  });

  it('rejects a malformed body with 400 before touching the database', async () => {
    m.requireUser.mockResolvedValue({ id: 'u1', email: 'u1@jobiest.com' });
    const res = await targetPOST(
      new Request('http://x/api/applications/target', {
        method: 'POST',
        body: JSON.stringify({ url: 'not-a-url' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });
});
