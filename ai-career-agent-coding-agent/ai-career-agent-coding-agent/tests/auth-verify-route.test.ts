import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * POST /api/auth/verify · pre-session email verification for password
 * signups. 'send' is anti-enumerative (identical ok for unknown/verified
 * accounts); 'confirm' activates the account and triggers the welcome email
 * exactly once; failures are generic; both actions rate-limited.
 */

const { listUsers, updateUserById } = vi.hoisted(() => ({ listUsers: vi.fn(), updateUserById: vi.fn() }));
const { issueEmailVerificationCode, confirmEmailVerificationCode } = vi.hoisted(() => ({
  issueEmailVerificationCode: vi.fn(),
  confirmEmailVerificationCode: vi.fn(),
}));
const { sendWelcomeEmailOnce } = vi.hoisted(() => ({ sendWelcomeEmailOnce: vi.fn() }));
const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { auth: { admin: { listUsers, updateUserById } } },
}));
vi.mock('@/lib/auth-oauth', () => ({ issueEmailVerificationCode, confirmEmailVerificationCode }));
vi.mock('@/lib/email/welcome', () => ({ sendWelcomeEmailOnce }));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
  requestIp: () => '127.0.0.1',
}));
vi.mock('@/lib/audit', () => ({ auditEvent: vi.fn() }));

import { POST } from '@/app/api/auth/verify/route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const UNCONFIRMED = { id: 'u1', email: 'ada@example.com', email_confirmed_at: null };
const CONFIRMED = { id: 'u2', email: 'verified@example.com', email_confirmed_at: '2026-09-17T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  enforceRateLimit.mockResolvedValue({ allowed: true });
  listUsers.mockResolvedValue({ data: { users: [UNCONFIRMED, CONFIRMED] }, error: null });
  updateUserById.mockResolvedValue({ data: {}, error: null });
  issueEmailVerificationCode.mockResolvedValue({ sent: true, cooldown: false });
  confirmEmailVerificationCode.mockResolvedValue('VERIFIED');
  sendWelcomeEmailOnce.mockResolvedValue(undefined);
});

describe('POST /api/auth/verify (send)', () => {
  it('issues a signup code for an unconfirmed account', async () => {
    const res = await POST(req({ action: 'send', email: 'ada@example.com' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(issueEmailVerificationCode).toHaveBeenCalledWith(
      { id: 'u1', email: 'ada@example.com', fullName: null },
      { kind: 'signup' },
    );
  });

  it('answers identically for unknown and already-verified accounts (anti-enumeration)', async () => {
    const unknown = await POST(req({ action: 'send', email: 'ghost@example.com' }));
    const verified = await POST(req({ action: 'send', email: 'verified@example.com' }));
    expect(unknown.status).toBe(200);
    expect(verified.status).toBe(200);
    await expect(unknown.json()).resolves.toEqual({ ok: true });
    await expect(verified.json()).resolves.toEqual({ ok: true });
    expect(issueEmailVerificationCode).not.toHaveBeenCalled();
  });

  it('reports cooldown without leaking account state', async () => {
    issueEmailVerificationCode.mockResolvedValue({ sent: false, cooldown: true });
    const res = await POST(req({ action: 'send', email: 'ada@example.com' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, message: /recently/i });
  });
});

describe('POST /api/auth/verify (confirm)', () => {
  it('activates the account and sends the welcome email once', async () => {
    const res = await POST(req({ action: 'confirm', email: 'ada@example.com', code: '123456' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(confirmEmailVerificationCode).toHaveBeenCalledWith({ id: 'u1' }, '123456');
    expect(updateUserById).toHaveBeenCalledWith('u1', { email_confirm: true });
    expect(sendWelcomeEmailOnce).toHaveBeenCalledWith('u1', 'ada@example.com');
  });

  it('is idempotent for an already-confirmed account', async () => {
    const res = await POST(req({ action: 'confirm', email: 'verified@example.com', code: '123456' }));
    expect(res.status).toBe(200);
    expect(confirmEmailVerificationCode).not.toHaveBeenCalled();
    expect(sendWelcomeEmailOnce).not.toHaveBeenCalled();
  });

  it('rejects an invalid code with a generic message', async () => {
    confirmEmailVerificationCode.mockResolvedValue('INVALID');
    const res = await POST(req({ action: 'confirm', email: 'ada@example.com', code: '000000' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('rejects an unknown email generically (no enumeration)', async () => {
    const res = await POST(req({ action: 'confirm', email: 'ghost@example.com', code: '123456' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, message: /code did not work/i });
  });

  it('rate limits', async () => {
    enforceRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(req({ action: 'send', email: 'ada@example.com' }));
    expect(res.status).toBe(429);
  });
});
