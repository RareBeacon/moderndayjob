import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * /api/auth/signup · the no-email-verification account creator.
 * The route must create users pre-confirmed (email_confirm: true) so
 * signup → sign-in works in one motion, and must translate raw Supabase
 * errors into honest, actionable messages.
 */

const { createUser } = vi.hoisted(() => ({ createUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { auth: { admin: { createUser } } },
}));

import { POST } from '@/app/api/auth/signup/route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => createUser.mockReset());

describe('POST /api/auth/signup', () => {
  it('creates the account pre-confirmed so no email round-trip is needed', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const res = await POST(req({ name: 'Ada', email: 'Ada@Example.com ', password: 'longenough1' }));
    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith({
      email: 'ada@example.com', // normalized
      password: 'longenough1',
      email_confirm: true,
      user_metadata: { full_name: 'Ada' },
    });
    await expect(res.json()).resolves.toEqual({ ok: true, user: { id: 'u1' } });
  });

  it('rejects a missing name', async () => {
    const res = await POST(req({ name: '   ', email: 'a@b.co', password: 'longenough1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before touching the admin API', async () => {
    const res = await POST(req({ name: 'Ada', email: 'not-an-email', password: 'longenough1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a password under 8 characters', async () => {
    const res = await POST(req({ name: 'Ada', email: 'a@b.co', password: 'short' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/8 characters/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('maps "already registered" to a friendly 409 pointing at sign-in', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 422, message: 'User already registered' } });
    const res = await POST(req({ name: 'Ada', email: 'a@b.co', password: 'longenough1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists/i);
  });

  it('maps rate limits to a 429 with a human message', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 429, message: 'Email rate limit exceeded' } });
    const res = await POST(req({ name: 'Ada', email: 'a@b.co', password: 'longenough1' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/try again in a minute/i);
  });

  it('returns a generic 500 for unexpected failures without leaking internals', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 500, message: 'internal db exploded' } });
    const res = await POST(req({ name: 'Ada', email: 'a@b.co', password: 'longenough1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/db exploded/);
  });
});
