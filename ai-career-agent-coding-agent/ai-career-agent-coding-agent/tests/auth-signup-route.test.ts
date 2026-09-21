import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * /api/auth/signup · account creator with email verification.
 * Registration collects full name, email, phone (E.164) and password
 * (owner brief 2026-09-21); all four are validated server-side. Accounts
 * are created UNCONFIRMED (email_confirm: false); a 6-digit verification
 * code + one-click link is emailed from no-reply@jobiest.com (owner
 * directive 2026-09-17) and the welcome email follows successful
 * verification. Rate limits, risk scoring, device cookies and the audit
 * trail are unchanged. Raw Supabase errors translate into honest messages.
 */

const { createUser, generateLink } = vi.hoisted(() => ({ createUser: vi.fn(), generateLink: vi.fn() }));
const { sendVerificationEmail } = vi.hoisted(() => ({ sendVerificationEmail: vi.fn() }));
const { issueEmailVerificationCode } = vi.hoisted(() => ({ issueEmailVerificationCode: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { auth: { admin: { createUser, generateLink } } },
}));
vi.mock('@/lib/email/resend', () => ({ sendVerificationEmail }));
vi.mock('@/lib/auth-oauth', () => ({ issueEmailVerificationCode }));

import { POST } from '@/app/api/auth/signup/route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = {
  email: 'Ada@Example.com ',
  password: 'longenough1!',
  fullName: 'Ada Lovelace',
  phone: '+2348012345676',
};

beforeEach(() => {
  createUser.mockReset();
  generateLink.mockReset();
  sendVerificationEmail.mockReset();
  createUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ada@example.com' } }, error: null });
  generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://jobiest.com/verify?token=abc' } }, error: null });
  sendVerificationEmail.mockResolvedValue({ ok: true });
  issueEmailVerificationCode.mockResolvedValue({ sent: true, cooldown: false });
});

describe('POST /api/auth/signup', () => {
  it('creates the account unconfirmed with the submitted identity and emails a verification code + link', async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith({
      email: 'ada@example.com', // normalized
      password: 'longenough1!',
      email_confirm: false, // activation requires the emailed code
      user_metadata: { full_name: 'Ada Lovelace', phone: '+2348012345676' }, // -> profiles row
    });
    expect(issueEmailVerificationCode).toHaveBeenCalledWith(
      { id: 'u1', email: 'ada@example.com', fullName: 'Ada Lovelace' },
      { kind: 'signup' },
    );
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ ok: true, user: { id: 'u1' }, mustVerify: true });
  });

  it('normalizes phone spacing/dashes to canonical E.164', async () => {
    const res = await POST(req({ ...VALID, email: 'a@b.co', phone: '+234 801-234. 5678' }));
    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ user_metadata: { full_name: 'Ada Lovelace', phone: '+2348012345678' } }),
    );
  });

  it('never leaves the signup blocked on a failed email send (resend exists)', async () => {
    issueEmailVerificationCode.mockResolvedValue({ sent: false, cooldown: false, error: 'EMAIL_FAILED' });
    const res = await POST(req({ ...VALID, email: 'a@b.co' }));
    expect(res.status).toBe(200);
    expect(generateLink).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ ok: true, user: { id: 'u1' }, mustVerify: true });
  });

  it('rejects an invalid email before touching the admin API', async () => {
    const res = await POST(req({ ...VALID, email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a missing or too-short full name', async () => {
    for (const fullName of ['', 'A', '   ']) {
      const res = await POST(req({ ...VALID, email: 'a@b.co', fullName }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/full name/i);
    }
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a name with characters names do not have', async () => {
    const res = await POST(req({ ...VALID, email: 'a@b.co', fullName: 'Ada <script>' }));
    expect(res.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a phone number without a valid country code', async () => {
    for (const phone of ['08011223344', '+234', 'abc', '+1234']) {
      const res = await POST(req({ ...VALID, email: 'a@b.co', phone }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/phone/i);
    }
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a password under 8 characters', async () => {
    const res = await POST(req({ ...VALID, email: 'a@b.co', password: 'sh0rt!' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/8 characters/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a password with no special character', async () => {
    const res = await POST(req({ ...VALID, email: 'a@b.co', password: 'longenough1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/special character/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a password with no number', async () => {
    const res = await POST(req({ ...VALID, email: 'a@b.co', password: 'longenough!' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/number/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('maps "already registered" to a friendly 409 pointing at sign-in', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 422, message: 'User already registered' } });
    const res = await POST(req({ ...VALID, email: 'a@b.co' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists/i);
  });

  it('maps rate limits to a 429 with a human message', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 429, message: 'Email rate limit exceeded' } });
    const res = await POST(req({ ...VALID, email: 'a@b.co' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/try again in a minute/i);
  });

  it('returns a generic 500 for unexpected failures without leaking internals', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 500, message: 'internal db exploded' } });
    const res = await POST(req({ ...VALID, email: 'a@b.co' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/db exploded/);
  });
});
