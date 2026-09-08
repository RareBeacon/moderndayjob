import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Auth middleware (Phase 9). Protected pages redirect unauthenticated users
 * to /login with a `next` return path; signed-in users are bounced off the
 * auth pages to /dashboard; and a missing Supabase config fails open (no
 * redirect loop) rather than crashing the request.
 */

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

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
    const res = await middleware(req('/jobs'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('fails open (no redirect) when Supabase env vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const res = await middleware(req('/applications/abc'));
    expect(res.headers.get('location')).toBeNull();
  });
});
