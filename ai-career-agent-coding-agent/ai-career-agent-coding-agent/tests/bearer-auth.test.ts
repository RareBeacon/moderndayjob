import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Bearer auth path in lib/auth:
 * - cookie session always wins (web unchanged)
 * - Bearer tokens are validated by the auth provider (admin getUser)
 * - needsMfa derives from SERVER-SIDE enrollment truth (the admin factors
 *   endpoint), not from the token alone: every authenticated token carries
 *   an aal claim (aal1 for password sessions), so the old claim-presence
 *   check wrongly gated every aal1 Bearer client with MFA_REQUIRED
 *   (fixed 2026-09-20). Semantics now mirror the cookie path's
 *   getAuthenticatorAssuranceLevel nextLevel check.
 * - tokens are never logged anywhere in this module
 */

const { cookieGetUser, cookieAal, adminGetUser, from, factorsFetch } = vi.hoisted(() => ({
  cookieGetUser: vi.fn(),
  cookieAal: vi.fn(),
  adminGetUser: vi.fn(),
  from: vi.fn(),
  factorsFetch: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: cookieGetUser,
      mfa: { getAuthenticatorAssuranceLevel: cookieAal },
    },
  }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { auth: { getUser: adminGetUser }, from },
}));

import { getAuthContext, getUser, requireUser } from '@/lib/auth';

function b64(json: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(json)).toString('base64');
}
const TOKEN_NO_CLAIM = `header.${b64({ sub: 'u1', exp: 9999999999 })}.sig`;
const TOKEN_AAL1 = `header.${b64({ sub: 'u1', exp: 9999999999, aal: 'aal1' })}.sig`;
const TOKEN_AAL2 = `header.${b64({ sub: 'u1', exp: 9999999999, aal: 'aal2' })}.sig`;
const USER = { id: 'u1', email: 'ada@example.com' };

function reqWith(token: string | null): Request {
  return new Request('http://localhost/api/x', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieGetUser.mockResolvedValue({ data: { user: null } });
  cookieAal.mockResolvedValue({ data: null });
  adminGetUser.mockResolvedValue({ data: { user: null }, error: null });
  // default: no enrolled factors (the common case)
  factorsFetch.mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal('fetch', factorsFetch);
  // profile status lookup used by requireUser
  from.mockReturnValue({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { account_status: 'ACTIVE' } })) })) })),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cookie path (web) is unchanged', () => {
  it('returns the cookie-session user without consulting Bearer state', async () => {
    cookieGetUser.mockResolvedValue({ data: { user: USER } });
    cookieAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
    const ctx = await getAuthContext(reqWith(TOKEN_AAL2));
    expect(ctx.user).toEqual(USER);
    expect(ctx.needsMfa).toBe(true);
    expect(adminGetUser).not.toHaveBeenCalled();
  });
});

describe('Bearer path (API clients)', () => {
  it('authenticates a valid token', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    const user = await getUser(reqWith(TOKEN_AAL1));
    expect(user).toEqual(USER);
  });

  it('rejects an invalid token', async () => {
    adminGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const user = await getUser(reqWith(TOKEN_AAL1));
    expect(user).toBeNull();
  });

  it('REGRESSION (2026-09-20 fix): aal1 password session, no enrolled factors -> NOT MFA-gated', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    factorsFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const ctx = await getAuthContext(reqWith(TOKEN_AAL1));
    expect(ctx.needsMfa).toBe(false);
    await expect(requireUser({ req: reqWith(TOKEN_AAL1) })).resolves.toEqual(USER);
  });

  it('token without an aal claim (defensive) -> not gated either', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    const ctx = await getAuthContext(reqWith(TOKEN_NO_CLAIM));
    expect(ctx.needsMfa).toBe(false);
  });

  it('aal1 WITH a verified enrolled factor -> MFA_REQUIRED', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    factorsFetch.mockResolvedValue({ ok: true, json: async () => [{ id: 'f1', status: 'verified' }] });
    const ctx = await getAuthContext(reqWith(TOKEN_AAL1));
    expect(ctx.needsMfa).toBe(true);
    await expect(requireUser({ req: reqWith(TOKEN_AAL1) })).rejects.toThrow('MFA_REQUIRED');
    await expect(requireUser({ req: reqWith(TOKEN_AAL1), allowIncompleteMfa: true })).resolves.toEqual(USER);
  });

  it('enrolled but UNverified factor -> not gated (mirrors cookie-path nextLevel semantics)', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    factorsFetch.mockResolvedValue({ ok: true, json: async () => [{ id: 'f1', status: 'unverified' }] });
    const ctx = await getAuthContext(reqWith(TOKEN_AAL1));
    expect(ctx.needsMfa).toBe(false);
  });

  it('aal2 (completed MFA) -> allowed, no factors lookup needed', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    const ctx = await getAuthContext(reqWith(TOKEN_AAL2));
    expect(ctx.needsMfa).toBe(false);
    expect(factorsFetch).not.toHaveBeenCalled();
  });

  it('factors endpoint unavailable -> fail open (availability over phantom MFA)', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    factorsFetch.mockRejectedValue(new Error('network down'));
    const ctx = await getAuthContext(reqWith(TOKEN_AAL1));
    expect(ctx.needsMfa).toBe(false);
  });

  it('ignores malformed Authorization headers', async () => {
    const user = await getUser(new Request('http://localhost/x', { headers: { authorization: 'Basic abc' } }));
    expect(user).toBeNull();
    expect(adminGetUser).not.toHaveBeenCalled();
  });

  it('requests without the Request argument behave exactly as before', async () => {
    const user = await getUser();
    expect(user).toBeNull();
  });
});
