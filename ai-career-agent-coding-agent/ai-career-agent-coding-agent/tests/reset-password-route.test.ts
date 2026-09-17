import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Route tests for the recovery password reset (2026-09-17 production fix).
 *
 * The bug: GoTrue recovery links land on /reset-password with the session in
 * the URL *fragment* (not ?token=), so the old page always failed with
 * "missing its token"; and the old route hashed the link token with sha256
 * before sending it as token_hash, although GoTrue link tokens ARE the
 * hashed_token and must be passed verbatim. These tests pin both fixes.
 */

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireUser }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        updateUserById: vi.fn(async () => ({ error: null })),
      },
    },
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIp: () => '127.0.0.1',
}));
vi.mock('@/lib/audit', () => ({ auditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon' },
}));

import { POST } from '@/app/api/auth/reset-password/route';

const fetchMock = vi.fn();

function req(body: unknown, cookie = 'sb-session=1') {
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('token path (legacy link / manual paste)', () => {
  it('passes the link token VERBATIM as token_hash (no sha256)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 'user-1' } }), { status: 200 }),
    );
    const res = await POST(req({ token: 'a'.repeat(56), password: 'NewPassword1!' }));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/auth/v1/verify');
    expect(JSON.parse(init.body)).toEqual({ type: 'recovery', token_hash: 'a'.repeat(56) });
  });

  it('returns 400 INVALID_OR_EXPIRED_LINK when GoTrue rejects the token', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"invalid"}', { status: 400 }));
    const res = await POST(req({ token: 'b'.repeat(56), password: 'NewPassword1!' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_OR_EXPIRED_LINK' });
  });
});

describe('session path (recovery link lands with #access_token)', () => {
  it('updates the password from the recovery session cookie', async () => {
    requireUser.mockResolvedValueOnce({ id: 'user-2' });
    const res = await POST(req({ password: 'NewPassword2!' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(requireUser).toHaveBeenCalledWith(expect.objectContaining({ allowIncompleteMfa: true }));
    // no GoTrue verify call in the session path
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 401 NO_RESET_SESSION without a session and without a token', async () => {
    requireUser.mockRejectedValueOnce(new Error('UNAUTHENTICATED'));
    const res = await POST(req({ password: 'NewPassword3!' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'NO_RESET_SESSION' });
  });

  it('never calls updateUserById without a proof (token or session)', async () => {
    requireUser.mockRejectedValueOnce(new Error('UNAUTHENTICATED'));
    await POST(req({ password: 'NewPassword4!' }));
    const { supabaseAdmin } = await import('@/lib/supabase');
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  it('rejects a short password with 400 INVALID_BODY', async () => {
    const res = await POST(req({ password: 'short' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_BODY' });
  });
});
