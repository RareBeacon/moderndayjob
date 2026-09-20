import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Owner email requirements (2026-09-17):
 *  - every email ends with "If you have any issues or enquiry, you can reach
 *    out to us at support@jobiest.com";
 *  - every email is fully branded (logo header, gold/navy banner, watermark);
 *  - welcome: personal letter from Philip Opeyemi, cofounder & CEO, sent
 *    from philip@jobiest.com;
 *  - MFA enabled: exact confirmation copy;
 *  - signup verification: 6-digit code + one-click link from no-reply@.
 */

vi.mock('@/lib/env', () => ({ env: { RESEND_API_KEY: 'test-key' } }));

import {
  sendWelcomeEmail,
  sendMfaSecurityEmail,
  sendPasswordResetEmail,
  sendSignupVerificationEmail,
  sendEmailVerificationCode,
} from '@/lib/email/resend';

const SENT: Array<{ to: string; from?: string; subject: string; html: string; text?: string }> = [];

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

const SUPPORT_LINE = 'If you have any issues or enquiry, you can reach out to us at';

describe('branded email requirements', () => {
  it('welcome: personal letter from Philip, from philip@jobiest.com, with support footer', async () => {
    const r = await sendWelcomeEmail('ada@example.com', 'Ada Lovelace');
    expect(r.ok).toBe(true);
    const mail = SENT[0];
    expect(mail.from).toBe('Philip Opeyemi <philip@jobiest.com>');
    expect(mail.subject).toMatch(/welcome/i);
    expect(mail.html).toContain('Hello Ada,');
    expect(mail.html).toContain('Philip Opeyemi');
    expect(mail.html).toContain('cofounder and CEO of Jobiest');
    expect(mail.html).toContain('appreciate you for trusting the platform');
    expect(mail.html).toContain(SUPPORT_LINE);
    expect(mail.html).toContain('support@jobiest.com');
    expect(mail.text).toContain(SUPPORT_LINE);
  });

  it('every template carries the banner, logo, watermark and support footer', async () => {
    await sendPasswordResetEmail('a@b.co', 'https://jobiest.com/reset-password#t=1');
    await sendMfaSecurityEmail('a@b.co', 'enabled', 'Ada');
    await sendSignupVerificationEmail('a@b.co', '123456', 'https://jobiest.com/verify-email?email=a%40b.co&code=123456', 'Ada');
    await sendEmailVerificationCode('a@b.co', '654321', 'Ada');
    expect(SENT).toHaveLength(4);
    for (const mail of SENT) {
      expect(mail.html).toContain('email-logo.png'); // branded logo header
      expect(mail.html).toContain('JOBIEST'); // watermark wordmark
      expect(mail.html).toContain(SUPPORT_LINE);
      expect(mail.text ?? '').toContain(SUPPORT_LINE);
    }
  });

  it('MFA enabled uses the owner-specified confirmation copy', async () => {
    await sendMfaSecurityEmail('ada@example.com', 'enabled', 'Ada');
    const mail = SENT[0];
    expect(mail.html).toContain('Hello Ada,');
    expect(mail.html).toContain('This is to confirm that you have successfully setup 2FA security on your account');
    expect(mail.html).toContain('Thank you.');
    expect(mail.text).toContain('successfully setup 2FA security on your account');
  });

  it('signup verification carries the 6-digit code and the one-click link', async () => {
    await sendSignupVerificationEmail('ada@example.com', '123456', 'https://jobiest.com/verify-email?email=ada%40example.com&code=123456', 'Ada');
    const mail = SENT[0];
    expect(mail.html).toContain('123456');
    expect(mail.html).toContain('https://jobiest.com/verify-email?email=ada%40example.com&amp;code=123456');
    expect(mail.subject).toMatch(/verify your email/i);
  });
});
