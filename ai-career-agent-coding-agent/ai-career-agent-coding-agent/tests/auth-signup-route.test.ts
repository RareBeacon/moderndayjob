import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * /api/auth/signup · mandatory-email-verification account creator.
 * The route must create users UNconfirmed (email_confirm: false), issue a
 * signup confirmation link through the admin API, email it, and translate raw
 * Supabase errors into honest, actionable messages.
 */

const { createUser, generateLink } = vi.hoisted(() => ({ createUser: vi.fn(), generateLink: vi.fn() }));
const { sendVerificationEmail } = vi.hoisted(() => ({ sendVerificationEmail: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { auth: { admin: { createUser, generateLink } } },
}));
vi.mock('@/lib/email/resend', () => ({ sendVerificationEmail }));

import { POST } from '@/app/api/auth/signup/route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  createUser.mockReset();
  generateLink.mockReset();
  sendVerificationEmail.mockReset();
  createUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ada@example.com' } }, error: null });
  generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://jobiest.com/verify?token=abc' } }, error: null });
  sendVerificationEmail.mockResolvedValue({ ok: true });
});

describe('POST /api/auth/signup', () => {
  it('creates the account unconfirmed and emails a verification link', async () => {
    const res = await POST(req({ name: 'Ada', email: 'Ada@Example.com ', password: 'longenough1' }));
    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith({
      email: 'ada@example.com', // normalized
      password: 'longenough1',
      email_confirm: false,
      user_metadata: { full_name: 'Ada' },
    });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'signup',
      email: 'ada@example.com',
      password: 'longenough1',
      options: { redirectTo: expect.stringMatching(/\/login$/) },
    });
    expect(sendVerificationEmail).toHaveBeenCalledWith('ada@example.com', 'https://jobiest.com/verify?token=abc');
    await expect(res.json()).resolves.toEqual({ ok: true, verificationRequired: true, user: { id: 'u1' } });
  });

  it('still succeeds (locked account) when the verification email cannot be sent', async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await POST(req({ name: 'Ada', email: 'a@b.co', password: 'longenough1' }));
    expect(res.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ ok: true, verificationRequired: true, user: { id: 'u1' } });
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
