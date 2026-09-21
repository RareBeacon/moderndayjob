import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * /api/auth/complete-account · the post-verification step for Google and
 * LinkedIn sign-ups (owner brief 2026-09-21): the PAGE sets the password
 * through the user's own session (kept alive; the admin path revoked
 * sessions and is no longer used here), and this route stores the phone
 * number plus profiles.password_set_at - the honest "has a password"
 * signal the completion gate reads. Only social-linked sessions may use
 * it; the phone is normalized to E.164; everything is decided
 * server-side.
 */

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
const { update } = vi.hoisted(() => ({ update: vi.fn() }));
const { auditEvent } = vi.hoisted(() => ({ auditEvent: vi.fn() }));
const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));

vi.mock('@/lib/auth', () => ({ requireUser }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
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
  update.mockReset().mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
  auditEvent.mockReset().mockResolvedValue(undefined);
  enforceRateLimit.mockReset().mockResolvedValue({ allowed: true });
});

describe('POST /api/auth/complete-account', () => {
  it('bounces anonymous callers', async () => {
    requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const res = await POST(req({ phone: '+2348012345676' }));
    expect(res.status).toBe(401);
  });

  it('rejects password-only accounts (form signups are already complete)', async () => {
    requireUser.mockResolvedValue(passwordUser);
    const res = await POST(req({ phone: '+2348012345676' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NOT_APPLICABLE');
    expect(update).not.toHaveBeenCalled();
  });

  it('saves the phone in E.164 and stamps password_set_at (the completion signal)', async () => {
    const res = await POST(req({ phone: '+234 801-234. 5678' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+2348012345678', // normalized E.164
        password_set_at: expect.any(String), // the gate reads this
      }),
    );
  });

  it('rejects an invalid phone number', async () => {
    for (const phone of ['08011223344', '+234', '12345678', 'abcd']) {
      const res = await POST(req({ phone }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('INVALID_PHONE');
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('reports a save failure honestly', async () => {
    update.mockReturnValue({ eq: vi.fn(async () => ({ error: { message: 'db down' } })) });
    const res = await POST(req({ phone: '+2348012345676' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('PHONE_FAILED');
  });
});
