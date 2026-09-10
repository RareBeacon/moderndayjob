import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * /api/auth/resend-verification · fresh signup-confirmation email on demand.
 * Must never reveal whether an account exists, must rate-limit per IP, and must
 * only email when a confirmation link could actually be generated.
 */

const { generateLink } = vi.hoisted(() => ({ generateLink: vi.fn() }));
const { sendVerificationEmail } = vi.hoisted(() => ({ sendVerificationEmail: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { auth: { admin: { generateLink } } },
}));
vi.mock('@/lib/email/resend', () => ({ sendVerificationEmail }));

import { POST } from '@/app/api/auth/resend-verification/route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  generateLink.mockReset();
  sendVerificationEmail.mockReset().mockResolvedValue({ ok: true });
});

describe('POST /api/auth/resend-verification', () => {
  it('sends the verification email when a link is generated', async () => {
    generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://jobiest.com/login?verify=1' } }, error: null });
    const res = await POST(req({ email: 'Ada@Example.com ' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'signup',
      email: 'ada@example.com',
      options: { redirectTo: expect.stringMatching(/\/login$/) },
    });
    expect(sendVerificationEmail).toHaveBeenCalledWith('ada@example.com', 'https://jobiest.com/login?verify=1');
  });

  it('returns ok without emailing when no link is generated (does not reveal existence)', async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: 'User not found' } });
    const res = await POST(req({ email: 'missing@example.com' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns ok for a malformed email without any admin call', async () => {
    const res = await POST(req({ email: 'not-an-email' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(generateLink).not.toHaveBeenCalled();
  });
});
