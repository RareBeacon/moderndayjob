import { describe, expect, it } from 'vitest';
import {
  DIGEST_EVENT_LIMIT,
  renderDigestHtml,
  renderDigestText,
  runSecurityDigest,
  summarizeEvents,
  type DigestEvent,
} from '@/lib/security/digest';

function evt(partial: Partial<DigestEvent> & { action: string }): DigestEvent {
  return {
    resource: 'auth',
    resource_id: null,
    user_id: null,
    meta: null,
    created_at: '2026-09-10T08:00:00.000Z',
    ...partial,
  };
}

describe('summarizeEvents', () => {
  it('counts by action and tracks signups/resets', () => {
    const data = summarizeEvents(
      [evt({ action: 'USER_SIGNUP' }), evt({ action: 'USER_SIGNUP' }), evt({ action: 'PASSWORD_RESET_REQUEST' }), evt({ action: 'AI_RESUME_GENERATED' })],
      new Date('2026-09-10T12:00:00.000Z'),
    );
    expect(data.total).toBe(4);
    expect(data.byAction).toEqual({ USER_SIGNUP: 2, PASSWORD_RESET_REQUEST: 1, AI_RESUME_GENERATED: 1 });
    expect(data.signups).toBe(2);
    expect(data.passwordResets).toBe(1);
    expect(data.windowStart).toBe('2026-09-09T12:00:00.000Z');
    expect(data.windowEnd).toBe('2026-09-10T12:00:00.000Z');
    expect(data.truncated).toBe(false);
  });

  it('extracts suspicious registrations and admin actions, and flags them', () => {
    const data = summarizeEvents([
      evt({ action: 'SUSPICIOUS_REGISTRATION', meta: { risk: 'EXTREME' } }),
      evt({ action: 'ADMIN_USER_SUSPEND', resource: 'admin' }),
      evt({ action: 'USER_SIGNIN' }),
    ]);
    expect(data.suspicious).toHaveLength(1);
    expect(data.suspicious[0].detail).toContain('EXTREME');
    expect(data.adminActions).toHaveLength(1);
    expect(data.flags).toHaveLength(2);
    expect(data.flags[0]).toContain('suspicious registration');
    expect(data.flags[1]).toContain('admin action');
  });

  it('flags a password-reset spike but stays quiet otherwise', () => {
    const spike = summarizeEvents([
      ...Array.from({ length: 6 }, () => evt({ action: 'PASSWORD_RESET_REQUEST' })),
      evt({ action: 'USER_SIGNUP' }),
    ]);
    expect(spike.flags.some((f) => f.includes('password-reset spike'))).toBe(true);

    const quiet = summarizeEvents([evt({ action: 'USER_SIGNUP' }), evt({ action: 'USER_SIGNIN' })]);
    expect(quiet.flags).toEqual([]);
  });

  it('marks truncation at the event limit', () => {
    const data = summarizeEvents(Array.from({ length: DIGEST_EVENT_LIMIT }, () => evt({ action: 'USER_SIGNIN' })));
    expect(data.truncated).toBe(true);
  });
});

describe('renderDigestHtml / renderDigestText', () => {
  it('escapes hostile event content in HTML', () => {
    const data = summarizeEvents([evt({ action: 'SUSPICIOUS_REGISTRATION', meta: { note: '<script>alert(1)</script>' } })]);
    const html = renderDigestHtml(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Needs attention');
  });

  it('renders an all-quiet digest with counts', () => {
    const data = summarizeEvents([evt({ action: 'USER_SIGNUP' })]);
    expect(renderDigestHtml(data)).toContain('All quiet');
    const text = renderDigestText(data);
    expect(text).toContain('USER_SIGNUP: 1');
    expect(text).toContain('Signups: 1');
  });
});

describe('runSecurityDigest', () => {
  it('skips when no admin recipient is configured', async () => {
    const report = await runSecurityDigest({ to: '' });
    expect(report).toEqual({ ok: true, skipped: 'ADMIN_ALERT_EMAIL_NOT_SET' });
  });

  it('rejects a non-email recipient without querying', async () => {
    let queried = false;
    const report = await runSecurityDigest({
      to: 'not-an-email',
      queryEvents: async () => {
        queried = true;
        return [];
      },
    });
    expect(report.skipped).toBe('ADMIN_ALERT_EMAIL_NOT_SET');
    expect(queried).toBe(false);
  });

  it('emails the summary and reports flags', async () => {
    const sent: { to: string; subject: string; html: string; text: string }[] = [];
    const report = await runSecurityDigest({
      to: 'admin@example.com',
      now: new Date('2026-09-10T12:00:00.000Z'),
      queryEvents: async () => [evt({ action: 'SUSPICIOUS_REGISTRATION', meta: { risk: 'EXTREME' } }), evt({ action: 'USER_SIGNUP' })],
      send: async (to, subject, html, text) => {
        sent.push({ to, subject, html, text });
        return { ok: true, id: 'email-1' };
      },
    });
    expect(report.ok).toBe(true);
    expect(report.emailed).toBe(true);
    expect(report.emailId).toBe('email-1');
    expect(report.total).toBe(2);
    expect(report.flags).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('admin@example.com');
    expect(sent[0].subject).toContain('1 flag(s)');
    expect(sent[0].text).toContain('SUSPICIOUS_REGISTRATION: 1');
  });

  it('reports email failures without throwing', async () => {
    const report = await runSecurityDigest({
      to: 'admin@example.com',
      queryEvents: async () => [],
      send: async () => ({ ok: false, error: 'RESEND_API_KEY_NOT_CONFIGURED' }),
    });
    expect(report.ok).toBe(true);
    expect(report.emailed).toBe(false);
    expect(report.emailError).toBe('RESEND_API_KEY_NOT_CONFIGURED');
  });

  it('reports query failures without throwing', async () => {
    const report = await runSecurityDigest({
      to: 'admin@example.com',
      queryEvents: async () => {
        throw new Error('DB_DOWN');
      },
    });
    expect(report.ok).toBe(false);
    expect(report.error).toBe('DB_DOWN');
  });
});
