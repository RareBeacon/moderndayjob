import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First-win email copy requirements (2026-10-05):
 *  - subject: "Your first scan takes 90 seconds";
 *  - reply-to support@jobiest.com (the copy promises a human reply);
 *  - text version ends with the standard support footer line;
 *  - the CTA points at the free ATS scanner;
 *  - no invented incentives: only the free daily credits that already exist.
 */

vi.mock('@/lib/env', () => ({ env: { RESEND_API_KEY: 'test-key' } }));

import { sendFirstWinEmail } from '@/lib/email/resend';

const SENT: Array<{ to: string; from?: string; reply_to?: string; subject: string; html: string; text?: string }> = [];

beforeEach(() => {
  SENT.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      SENT.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: 'test-id' }), { status: 200 });
    }),
  );
});

describe('first-win email copy', () => {
  it('carries the right subject, reply-to, scanner CTA and support footer', async () => {
    const result = await sendFirstWinEmail('dormant@example.com', 'Chidi Nwosu');
    expect(result.ok).toBe(true);
    expect(SENT).toHaveLength(1);
    const mail = SENT[0];
    expect(mail.subject).toBe('Your first scan takes 90 seconds');
    expect(mail.to).toEqual(['dormant@example.com']);
    expect(mail.reply_to).toBe('support@jobiest.com');
    expect(mail.html).toContain('/free-ats-resume-scanner');
    expect(mail.text).toContain('/free-ats-resume-scanner');
    expect(mail.text).toContain('If you have any issues or enquiry, you can reach out to us at support@jobiest.com');
    expect(mail.text).toContain('Hello Chidi');
  });

  it('falls back to a generic greeting without a name', async () => {
    await sendFirstWinEmail('x@example.com');
    expect(SENT[0].text).toContain('Hello there');
  });

  it('is gated when RESEND_API_KEY is not configured', async () => {
    const { env } = await import('@/lib/env');
    const original = env.RESEND_API_KEY;
    (env as { RESEND_API_KEY: string }).RESEND_API_KEY = '';
    const result = await sendFirstWinEmail('y@example.com', 'Zed');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('RESEND_API_KEY_NOT_CONFIGURED');
    (env as { RESEND_API_KEY: string }).RESEND_API_KEY = original;
  });
});
