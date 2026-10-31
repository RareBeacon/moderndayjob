import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { signInWithOAuth, exchangeCodeForSession, getUser, getSession, getAal } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  getAal: vi.fn(),
}));

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

const { enforceRateLimit } = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
}));

const { createAppSession } = vi.hoisted(() => ({
  createAppSession: vi.fn(),
}));

const { ensureProfile } = vi.hoisted(() => ({
  ensureProfile: vi.fn(),
}));

const { resolveAuthDestination, markProfileVerified } = vi.hoisted(() => ({
  resolveAuthDestination: vi.fn(),
  markProfileVerified: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit, requestIp: () => '127.0.0.1' }));
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>('@/lib/session');
  return {
    ...actual,
    createAppSession,
  };
});
vi.mock('@/lib/auth/profile', () => ({ ensureProfile }));
vi.mock('@/lib/auth/routing', () => ({ resolveAuthDestination, markProfileVerified }));
vi.mock('@/lib/auth-oauth', () => ({ issueEmailVerificationCode: vi.fn(async () => ({ sent: true, cooldown: false })) }));
vi.mock('@/lib/email/welcome', () => ({ sendWelcomeEmailOnce: vi.fn(async () => {}) }));
vi.mock('@/lib/credits', () => ({ ensurePeriodGrants: vi.fn(async () => 0) }));

import { GET as startOAuthGet } from '@/app/api/auth/oauth/route';
import { OAUTH_CTX_COOKIE } from '@/lib/auth/oauth-origin';
import { GET as callbackGet } from '@/app/auth/callback/route';
import { middleware } from '../middleware';

describe('OAuth starter + callback + middleware bypass', () => {
  let latestCookiesAdapter: {
    getAll: () => Array<{ name: string; value: string }>;
    setAll: (items: Array<{ name: string; value: string; options: Record<string, unknown> }>) => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimit.mockResolvedValue({ allowed: true });
    ensureProfile.mockResolvedValue(undefined);
    markProfileVerified.mockResolvedValue(undefined);
    createAppSession.mockResolvedValue({ token: 'app-session-tok', row: { id: 's1' } });
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });

    createServerClient.mockImplementation((_url: string, _key: string, opts: { cookies: typeof latestCookiesAdapter }) => {
      latestCookiesAdapter = opts.cookies;
      return {
        auth: {
          signInWithOAuth,
          exchangeCodeForSession,
          getUser,
          getSession,
          mfa: { getAuthenticatorAssuranceLevel: getAal },
        },
      };
    });
  });

  it('preserves exact www.jobiest.com host on redirectTo and writes PKCE + context cookies on 302', async () => {
    signInWithOAuth.mockImplementation(async ({ options }: { options: { redirectTo: string } }) => {
      latestCookiesAdapter.setAll([
        { name: 'sb-test-auth-token-code-verifier', value: 'pkce-secret', options: { path: '/', httpOnly: true } },
      ]);
      return {
        data: { url: `https://example.supabase.co/auth/v1/authorize?redirect_to=${encodeURIComponent(options.redirectTo)}` },
        error: null,
      };
    });

    const req = new NextRequest('https://www.jobiest.com/api/auth/oauth?provider=google&from=/signup&next=/onboarding');
    const res = await startOAuthGet(req);

    expect(res.status).toBe(302);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://www.jobiest.com/auth/callback',
        queryParams: { prompt: 'select_account' },
      },
    });
    expect(res.cookies.get('sb-test-auth-token-code-verifier')?.value).toBe('pkce-secret');
    const ctxCookie = res.cookies.get(OAUTH_CTX_COOKIE)?.value;
    expect(ctxCookie).toBeTruthy();
    expect(JSON.parse(ctxCookie!)).toEqual({
      next: '/onboarding',
      from: '/signup',
      provider: 'google',
    });
  });

  it('redirects back to /signup?error=provider_disabled when LinkedIn provider is not enabled', async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: 'Unsupported provider: provider is not enabled' },
    });

    const req = new NextRequest('https://jobiest.com/api/auth/oauth?provider=linkedin_oidc&from=/signup');
    const res = await startOAuthGet(req);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://jobiest.com/signup?error=provider_disabled&provider=linkedin');
  });

  it('preserves auth cookies across multiple setAll calls in /auth/callback and mints jobiest_app_session', async () => {
    exchangeCodeForSession.mockImplementation(async () => {
      latestCookiesAdapter.setAll([
        { name: 'sb-test-auth-token', value: 'jwt-session-val', options: { path: '/', maxAge: 3600 } },
        { name: 'sb-test-auth-token-code-verifier', value: '', options: { path: '/', maxAge: 0 } },
      ]);
      return { data: { session: {} }, error: null };
    });
    getUser.mockImplementation(async () => {
      // Simulate a second setAll call during getUser() that would previously clobber response cookies
      latestCookiesAdapter.setAll([
        { name: 'sb-test-auth-token-meta', value: 'ok', options: { path: '/' } },
      ]);
      return {
        data: {
          user: {
            id: 'u-google-1',
            email: 'newuser@gmail.com',
            email_confirmed_at: '2026-10-31T00:00:00Z',
            app_metadata: { providers: ['google'] },
          },
        },
      };
    });
    resolveAuthDestination.mockResolvedValue({
      requiresVerification: false,
      needsCompletion: true,
      providerVerified: true,
    });

    const req = new NextRequest('https://jobiest.com/auth/callback?code=oauth-code-123', {
      headers: {
        cookie: `${OAUTH_CTX_COOKIE}=${encodeURIComponent(JSON.stringify({ next: '/onboarding', from: '/signup', provider: 'google' }))}`,
      },
    });
    const res = await callbackGet(req);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://jobiest.com/complete-account?next=%2Fonboarding');
    expect(res.cookies.get('sb-test-auth-token')?.value).toBe('jwt-session-val');
    expect(res.cookies.get('sb-test-auth-token-meta')?.value).toBe('ok');
    expect(res.cookies.get('sb-test-auth-token-code-verifier')?.maxAge).toBe(0);
    expect(res.cookies.get('jobiest_app_session')?.value).toBe('app-session-tok');
    expect(res.cookies.get(OAUTH_CTX_COOKIE)?.maxAge).toBe(0);
  });

  it('middleware never intercepts /auth/callback even when cookies exist', async () => {
    const req = new NextRequest('https://jobiest.com/auth/callback?code=abc');
    const res = await middleware(req);
    expect(res.headers.get('location')).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
