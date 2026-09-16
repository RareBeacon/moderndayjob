import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Support route: every message is stored; delivery to the configured inbox
 * is reported honestly (delivered=true only when Resend accepted it); no
 * inbox configured -> stored only, no fake success copy implied.
 */

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));
const { auditEvent } = vi.hoisted(() => ({ auditEvent: vi.fn() }));
const insert = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ getUser }));
vi.mock('@/lib/email/resend', () => ({ sendEmail }));
vi.mock('@/lib/audit', () => ({ auditEvent }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit, requestIp: () => '203.0.113.9' }));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) =>
      table === 'app_config'
        ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) }
        : { insert },
  },
}));

import { POST } from '@/app/api/support/route';

function req(body: unknown) {
  return new Request('http://localhost/api/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const payload = {
  email: 'customer@example.com',
  category: 'CV & Resume',
  subject: 'CV export stuck',
  message: 'My CV export has been stuck for ten minutes on Chrome Android.',
};

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue(null);
  enforceRateLimit.mockResolvedValue({ allowed: true });
  auditEvent.mockResolvedValue(undefined);
  insert.mockResolvedValue({ error: null });
  maybeSingle.mockResolvedValue({ data: { value: { email: 'owner@jobiest.com' } } });
  sendEmail.mockResolvedValue({ ok: true, id: 're_1' });
});

describe('POST /api/support', () => {
  it('stores the message and delivers to the configured inbox with reply-to preserved', async () => {
    const res = await POST(req(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.delivered).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'customer@example.com', category: 'CV & Resume' })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@jobiest.com', replyTo: 'customer@example.com' })
    );
  });

  it('stores without claiming delivery when no inbox is configured', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const res = await POST(req(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.delivered).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('reports stored-only honestly when the email send fails', async () => {
    sendEmail.mockResolvedValue({ ok: false, error: 'RESEND_500' });
    const res = await POST(req(payload));
    const body = await res.json();
    expect(body.delivered).toBe(false);
  });

  it('rejects short messages and bad categories', async () => {
    expect((await POST(req({ ...payload, message: 'hi' }))).status).toBe(400);
    expect((await POST(req({ ...payload, category: 'Not A Category' }))).status).toBe(400);
  });

  it('rate limits repeat submissions', async () => {
    enforceRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(req(payload));
    expect(res.status).toBe(429);
  });

  it('returns 500 when the message cannot be stored', async () => {
    insert.mockResolvedValue({ error: new Error('db down') });
    const res = await POST(req(payload));
    expect(res.status).toBe(500);
  });
});
