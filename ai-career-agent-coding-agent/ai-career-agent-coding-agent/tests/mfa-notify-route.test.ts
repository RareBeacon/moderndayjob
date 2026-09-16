import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * MFA notification route: branded security emails are only sent when the
 * SERVER-VERIFIED factor state matches the claimed event, so a spoofed
 * client request can never trigger fake security alerts.
 */

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
const { listFactors } = vi.hoisted(() => ({ listFactors: vi.fn() }));
const { sendMfaSecurityEmail } = vi.hoisted(() => ({ sendMfaSecurityEmail: vi.fn() }));
const { auditEvent } = vi.hoisted(() => ({ auditEvent: vi.fn() }));
const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));
const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/lib/auth', () => ({ requireUser }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { auth: { admin: { mfa: { listFactors } } }, from } }));
vi.mock('@/lib/email/resend', () => ({ sendMfaSecurityEmail }));
vi.mock('@/lib/audit', () => ({ auditEvent }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit, requestIp: () => '127.0.0.1' }));

import { POST } from '@/app/api/auth/mfa/notify/route';

const user = { id: 'u1', email: 'ada@example.com' };

function req(body: unknown) {
  return new Request('http://localhost/api/auth/mfa/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(user);
  enforceRateLimit.mockResolvedValue({ allowed: true });
  sendMfaSecurityEmail.mockResolvedValue({ ok: true });
  auditEvent.mockResolvedValue(undefined);
  from.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { full_name: 'Ada' } })) })) })) });
});

describe('POST /api/auth/mfa/notify', () => {
  it('sends the enabled email when a verified factor really exists', async () => {
    listFactors.mockResolvedValue({ data: { factors: [{ id: 'f1', status: 'verified' }] } });
    const res = await POST(req({ event: 'enabled' }));
    expect(res.status).toBe(200);
    expect(sendMfaSecurityEmail).toHaveBeenCalledWith('ada@example.com', 'enabled', 'Ada');
    expect(auditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'MFA_ENABLED' }));
  });

  it('refuses to send a fake enabled email when no verified factor exists', async () => {
    listFactors.mockResolvedValue({ data: { factors: [{ id: 'f1', status: 'unverified' }] } });
    const res = await POST(req({ event: 'enabled' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(sendMfaSecurityEmail).not.toHaveBeenCalled();
  });

  it('sends the disabled email when the factor list is empty', async () => {
    listFactors.mockResolvedValue({ data: { factors: [] } });
    const res = await POST(req({ event: 'disabled' }));
    expect(res.status).toBe(200);
    expect(sendMfaSecurityEmail).toHaveBeenCalledWith('ada@example.com', 'disabled', 'Ada');
  });

  it('bounces anonymous callers and bad bodies', async () => {
    requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    expect((await POST(req({ event: 'enabled' }))).status).toBe(401);
    requireUser.mockResolvedValue(user);
    listFactors.mockResolvedValue({ data: { factors: [] } });
    expect((await POST(req({ event: 'nope' }))).status).toBe(400);
  });

  it('rate limits silently: throttled notifications do not fail the client flow or send mail', async () => {
    enforceRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(req({ event: 'disabled' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateLimited).toBe(true);
    expect(sendMfaSecurityEmail).not.toHaveBeenCalled();
  });
});
