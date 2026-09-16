import { describe, expect, it, vi } from 'vitest';

/**
 * /api/auth/signout · must end the session AND return a 303 redirect to
 * the homepage. The app shell posts this as a plain HTML form, so a JSON
 * response would navigate the user to a raw `{"ok":true}` blob (the bug
 * this test guards against).
 */
const signOut = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { signOut } }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
}));

import { POST } from '@/app/api/auth/signout/route';

describe('POST /api/auth/signout', () => {
  it('signs the user out and redirects to the homepage (303, not JSON)', async () => {
    const res = await POST(new Request('https://jobiest.com/api/auth/signout', { method: 'POST' }));
    expect(signOut).toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location') ?? '', 'https://jobiest.com').pathname).toBe('/');
  });
});
