import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Auth middleware (Phase 9). Protected pages redirect unauthenticated users
 * to /login with a `next` return path; signed-in users are bounced off the
 * auth pages to /dashboard; and a missing Supabase config fails open (no
 * redirect loop) rather than crashing the request.
 */

const { getUser, from } = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser }, from }),
}));

/** profiles row chain for the social gates. */
function profilesRow(row: Record<string, unknown> | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row }),
  };
  from.mockImplementation(() => chain);
}

import { middleware } from '../middleware';

function req(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

afterEach(() => vi.unstubAllEnvs());

describe('auth middleware', () => {
  it('redirects unauthenticated users off protected pages to /login?next=…', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(req('/applications/abc'));
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/applications/abc');
  });

  it('redirects signed-in users away from /login to /dashboard', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await middleware(req('/login'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('lets a signed-in user through a protected page', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await middleware(req('/applications'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets visitors browse the public tools page', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(req('/tools'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('keeps /verify-email reachable without a session (pre-session password verification)', async () => {
    // Regression (2026-09-21): /verify-email was wrongly in PROTECTED, so
    // unconfirmed signups (no session yet) were bounced to /login in a loop
    // before they could ever enter their code.
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(req('/verify-email?email=someone@example.com'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('sends an unverified google session to /verify-email', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'gu1', app_metadata: { providers: ['google'] } } } });
    profilesRow({ email_verified_at: null, phone: null });
    const res = await middleware(req('/dashboard'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/verify-email');
  });

  it('sends a verified google session without password + phone to /complete-account', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'gu1', app_metadata: { providers: ['google'] } } } });
    profilesRow({ email_verified_at: '2026-09-21T00:00:00Z', phone: null });
    const res = await middleware(req('/dashboard'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/complete-account');
  });

  it('keeps /complete-account itself reachable for a session that needs it', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'gu1', app_metadata: { providers: ['google'] } } } });
    profilesRow({ email_verified_at: '2026-09-21T00:00:00Z', phone: null });
    const res = await middleware(req('/complete-account'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets a completed google session through to the dashboard', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'gu1', app_metadata: { providers: ['google', 'email'] } } } });
    profilesRow({ email_verified_at: '2026-09-21T00:00:00Z', phone: '+2348012345678' });
    const res = await middleware(req('/dashboard'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects anonymous users away from /complete-account to login', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(req('/complete-account'));
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
  });

  it('redirects a visitor with a session cookie from / to /dashboard', async () => {
    const r = new NextRequest('http://localhost:3000/', {
      headers: { cookie: 'sb-testref-auth-token=some.jwt.token' },
    });
    const res = await middleware(r);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('shows the marketing homepage to visitors without a session cookie', async () => {
    const res = await middleware(req('/'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('fails open (no redirect) when Supabase env vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const res = await middleware(req('/applications/abc'));
    expect(res.headers.get('location')).toBeNull();
  });
});
