import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * /api/auth/complete-account · the post-verification step for Google and
 * LinkedIn sign-ups (owner brief 2026-09-21): set a password + phone so
 * every account carries the same three credentials. Only social-linked
 * sessions may use it; the password policy matches the signup form; the
 * phone lands in profiles; everything is decided server-side.
 */

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
const { updateUserById } = vi.hoisted(() => ({ updateUserById: vi.fn() }));
const { update } = vi.hoisted(() => ({ update: vi.fn() }));
const { auditEvent } = vi.hoisted(() => ({ auditEvent: vi.fn() }));
const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));

vi.mock('@/lib/auth', () => ({ requireUser }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    auth: { admin: { updateUserById } },
    from: () => ({ update }),
  },
}));
vi.mock('@/lib/audit', () => ({ auditEvent }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit, requestIp: () => '127.0.0.1' }));

import { POST } from '@/app/api/auth/complete-account/route';

const googleUser = {
  id: 'gu1',
  email: 'philip@gmail.com',
  app_metadata: { providers: ['google'] },
};
const passwordUser = {
  id: 'pu1',
  email: 'philip@example.com',
  app_metadata: { providers: ['email'] },
};

function req(body: unknown) {
  return new Request('http://localhost/api/auth/complete-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(googleUser);
  updateUserById.mockReset().mockResolvedValue({ data: { user: googleUser }, error: null });
  update.mockReset().mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
  auditEvent.mockReset().mockResolvedValue(undefined);
  enforceRateLimit.mockReset().mockResolvedValue({ allowed: true });
});

describe('POST /api/auth/complete-account', () => {
  it('bounces anonymous callers', async () => {
    requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const res = await POST(req({ password: 'longenough1!', phone: '+2348012345676' }));
    expect(res.status).toBe(401);
  });

  it('rejects password-only accounts (form signups are already complete)', async () => {
    requireUser.mockResolvedValue(passwordUser);
    const res = await POST(req({ password: 'longenough1!', phone: '+2348012345676' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NOT_APPLICABLE');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('sets the password identity and saves the phone for a google account', async () => {
    const res = await POST(req({ password: 'longenough1!', phone: '+234 801-234. 5678' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateUserById).toHaveBeenCalledWith('gu1', { password: 'longenough1!' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ phone: '+2348012345678' }));
  });

  it('rejects an invalid phone number', async () => {
    for (const phone of ['08011223344', '+234', '12345678', 'abcd']) {
      const res = await POST(req({ password: 'longenough1!', phone }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('INVALID_PHONE');
    }
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('enforces the full password policy', async () => {
    for (const password of ['sh0rt!', 'longenough1', 'longenough!']) {
      const res = await POST(req({ password, phone: '+2348012345676' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('WEAK_PASSWORD');
    }
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('reports a password-save failure honestly', async () => {
    updateUserById.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } });
    const res = await POST(req({ password: 'longenough1!', phone: '+2348012345676' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('PASSWORD_FAILED');
  });

  it('reports a phone-save failure honestly after the password is stored', async () => {
    update.mockReturnValue({ eq: vi.fn(async () => ({ error: { message: 'db down' } })) });
    const res = await POST(req({ password: 'longenough1!', phone: '+2348012345676' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('PHONE_FAILED');
  });
});
