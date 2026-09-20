import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression tests for the unauthenticated-500 bug class found in the
 * 2026-09-17 production audit: routes that call the throwing requireUser()
 * BEFORE their try block turned UNAUTHENTICATED into a 500 instead of 401.
 * These tests pin the corrected behavior: 401 (UNAUTHENTICATED), 401
 * (MFA_REQUIRED), 403 (ACCOUNT_SUSPENDED/TERMINATED).
 */

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireUser }));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIp: () => '127.0.0.1',
}));

import { GET as getApp } from '@/app/api/applications/[id]/route';
import { POST as postPrepare } from '@/app/api/applications/prepare/route';
import { GET as getAdminUsers } from '@/app/api/admin/users/route';

function req(url: string, init: RequestInit = {}) {
  return new Request(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('unauthenticated callers receive 401, never 500', () => {
  it('GET /api/applications/[id] maps UNAUTHENTICATED to 401', async () => {
    requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const res = await getApp(
      req('http://localhost/api/applications/00000000-0000-4000-8000-000000000001'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });

  it('GET /api/applications/[id] maps MFA_REQUIRED to 401', async () => {
    requireUser.mockRejectedValue(new Error('MFA_REQUIRED'));
    const res = await getApp(
      req('http://localhost/api/applications/00000000-0000-4000-8000-000000000001'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'MFA_REQUIRED' });
  });

  it('GET /api/applications/[id] maps ACCOUNT_SUSPENDED to 403', async () => {
    requireUser.mockRejectedValue(new Error('ACCOUNT_SUSPENDED'));
    const res = await getApp(
      req('http://localhost/api/applications/00000000-0000-4000-8000-000000000001'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    );
    expect(res.status).toBe(403);
  });

  it('POST /api/applications/prepare maps UNAUTHENTICATED to 401', async () => {
    requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const res = await postPrepare(
      req('http://localhost/api/applications/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: '00000000-0000-4000-8000-000000000002' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });

  it('GET /api/admin/users maps UNAUTHENTICATED to 401 (not 500)', async () => {
    requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const res = await getAdminUsers(req('http://localhost/api/admin/users'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });
});
