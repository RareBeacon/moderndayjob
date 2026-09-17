import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Native-client (Bearer) auth path in lib/auth:
 * - cookie session always wins (web unchanged)
 * - Bearer tokens are validated by the auth provider (admin getUser)
 * - needsMfa derives from the token's aal claim: enrolled-but-not-completed
 *   (aal1 WITH the claim) gates; no claim (no factors) never gates
 * - tokens are never logged anywhere in this module
 */

const { cookieGetUser, cookieAal, adminGetUser, from } = vi.hoisted(() => ({
  cookieGetUser: vi.fn(),
  cookieAal: vi.fn(),
  adminGetUser: vi.fn(),
  from: vi.fn(),
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
vi.mock('./env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } }));

import { getAuthContext, getUser, requireUser } from '@/lib/auth';

function b64(json: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(json)).toString('base64');
}
const TOKEN_NO_FACTORS = `header.${b64({ sub: 'u1', exp: 9999999999 })}.sig`;
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
  // profile status lookup used by requireUser
  from.mockReturnValue({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { account_status: 'ACTIVE' } })) })) })),
  });
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

describe('Bearer path (native clients)', () => {
  it('authenticates a valid token', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    const user = await getUser(reqWith(TOKEN_NO_FACTORS));
    expect(user).toEqual(USER);
  });

  it('rejects an invalid token', async () => {
    adminGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const user = await getUser(reqWith(TOKEN_NO_FACTORS));
    expect(user).toBeNull();
  });

  it('no aal claim (no factors enrolled) -> never MFA-gated', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    const ctx = await getAuthContext(reqWith(TOKEN_NO_FACTORS));
    expect(ctx.needsMfa).toBe(false);
    await expect(requireUser({ req: reqWith(TOKEN_NO_FACTORS) })).resolves.toEqual(USER);
  });

  it('aal1 with claim (enrolled, not completed) -> MFA_REQUIRED', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    const ctx = await getAuthContext(reqWith(TOKEN_AAL1));
    expect(ctx.needsMfa).toBe(true);
    await expect(requireUser({ req: reqWith(TOKEN_AAL1) })).rejects.toThrow('MFA_REQUIRED');
    await expect(requireUser({ req: reqWith(TOKEN_AAL1), allowIncompleteMfa: true })).resolves.toEqual(USER);
  });

  it('aal2 (completed) -> allowed', async () => {
    adminGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    const ctx = await getAuthContext(reqWith(TOKEN_AAL2));
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
