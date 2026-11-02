import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockEnv,
  sendMailMock,
  verifyMock,
  auditLogMock,
  requireOwnerMock,
  requirePermMock,
} = vi.hoisted(() => ({
  mockEnv: {
    RESEND_API_KEY: '',
    RESEND_FROM: 'Jobiest <no-reply@jobiest.com>',
    BREVO_API_KEY: '',
    BREVO_FROM: '',
    SMTP_HOST: '',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'no-reply@jobiest.com',
    SMTP_PASSWORD: 'super-secret-smtp-password',
    EMAIL_FROM: 'Jobiest <no-reply@jobiest.com>',
    TRANSACTIONAL_STRATEGY: 'auto',
    EMAIL_PROVIDER_ORDER: 'smtp,brevo,resend',
    SMTP_FALLBACK: 'true',
  } as Record<string, string>,
  sendMailMock: vi.fn(),
  verifyMock: vi.fn(),
  auditLogMock: vi.fn(),
  requireOwnerMock: vi.fn(),
  requirePermMock: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: mockEnv }));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
      verify: verifyMock,
    })),
  },
}));

vi.mock('@/lib/admin', () => ({
  requireOwnerAdmin: (...args: unknown[]) => requireOwnerMock(...args),
  requireAdminPermission: (...args: unknown[]) => requirePermMock(...args),
  appendAdminAuditLog: (...args: unknown[]) => auditLogMock(...args),
  adminErrorResponse: (err: unknown) =>
    Response.json({ error: err instanceof Error ? err.message : 'ADMIN_ERR' }, { status: 403 }),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIp: vi.fn(() => '127.0.0.1'),
}));

import {
  getEmailInfrastructureStatus,
  parseSenderAddress,
  resetEmailTransportStatsForTests,
  resolveProviderChain,
  sendTransactionalEmail,
  verifySmtpConnection,
} from '@/lib/email/transport';
import { GET as adminEmailGet, POST as adminEmailPost } from '@/app/api/admin/email/route';

describe('self-hosted & multi-transport $0 email engine', () => {
  beforeEach(() => {
    resetEmailTransportStatsForTests();
    sendMailMock.mockReset();
    verifyMock.mockReset();
    auditLogMock.mockReset();
    requireOwnerMock.mockReset();
    requirePermMock.mockReset();

    mockEnv.RESEND_API_KEY = '';
    mockEnv.BREVO_API_KEY = '';
    mockEnv.SMTP_HOST = '';
    mockEnv.SMTP_PORT = '465';
    mockEnv.SMTP_SECURE = 'true';
    mockEnv.SMTP_USER = 'no-reply@jobiest.com';
    mockEnv.SMTP_PASSWORD = 'super-secret-smtp-password';
    mockEnv.TRANSACTIONAL_STRATEGY = 'auto';
    mockEnv.EMAIL_PROVIDER_ORDER = 'smtp,brevo,resend';
    mockEnv.SMTP_FALLBACK = 'true';
    mockEnv.STALWART_API_URL = '';
    mockEnv.STALWART_ADMIN_USER = 'postmaster';
    mockEnv.STALWART_ADMIN_PASSWORD = '';
  });

  it('parses RFC 5322 sender addresses cleanly for Brevo & SMTP', () => {
    expect(parseSenderAddress('Philip Opeyemi <philip@jobiest.com>')).toEqual({
      name: 'Philip Opeyemi',
      email: 'philip@jobiest.com',
    });
    expect(parseSenderAddress('support@jobiest.com')).toEqual({
      name: 'Jobiest',
      email: 'support@jobiest.com',
    });
  });

  it('orders configured providers according to EMAIL_PROVIDER_ORDER and TRANSACTIONAL_STRATEGY', () => {
    mockEnv.SMTP_HOST = 'mail.jobiest.com';
    mockEnv.BREVO_API_KEY = 'xkeysib-test-123';
    mockEnv.RESEND_API_KEY = 're_test_456';

    expect(resolveProviderChain()).toEqual(['smtp', 'brevo', 'resend']);

    mockEnv.TRANSACTIONAL_STRATEGY = 'resend';
    expect(resolveProviderChain()).toEqual(['resend', 'smtp', 'brevo']);

    mockEnv.SMTP_FALLBACK = 'false';
    expect(resolveProviderChain()).toEqual(['resend']);
  });

  it('delivers directly through self-hosted Stalwart SMTP when healthy without calling HTTP relays', async () => {
    mockEnv.SMTP_HOST = 'mail.jobiest.com';
    mockEnv.RESEND_API_KEY = 're_test_456';
    sendMailMock.mockResolvedValueOnce({ messageId: '<stalwart-msg-1@jobiest.com>' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await sendTransactionalEmail({
      to: 'ada@example.com',
      subject: 'Welcome',
      html: '<p>Hello</p>',
    });

    expect(res).toEqual({
      skipped: false,
      id: '<stalwart-msg-1@jobiest.com>',
      provider: 'smtp',
      attemptedProviders: ['smtp'],
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('automatically fails over smtp -> brevo -> resend when upstream free caps or timeouts occur', async () => {
    mockEnv.SMTP_HOST = 'mail.jobiest.com';
    mockEnv.BREVO_API_KEY = 'xkeysib-secret-token';
    mockEnv.RESEND_API_KEY = 're_secret_token';

    sendMailMock.mockRejectedValueOnce(new Error('ETIMEDOUT mail.jobiest.com:465'));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('api.brevo.com')) {
        return new Response('Daily quota exceeded', { status: 429 });
      }
      return new Response(JSON.stringify({ id: 'resend-fallback-ok' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await sendTransactionalEmail({
      to: 'ada@example.com',
      subject: 'Verification Code from Jobiest',
      html: '<p>123456</p>',
    });

    expect(res.skipped).toBe(false);
    expect(res.provider).toBe('resend');
    expect(res.id).toBe('resend-fallback-ok');
    expect(res.attemptedProviders).toEqual(['smtp', 'brevo', 'resend']);

    const status = getEmailInfrastructureStatus();
    expect(status.totalFailovers).toBe(1);
    expect(status.estimatedFreeMonthlyCapacity).toBe(12_000);
  });

  it('verifies SMTP handshake and redacts secret tokens from error summaries', async () => {
    mockEnv.SMTP_HOST = 'mail.jobiest.com';
    verifyMock.mockResolvedValueOnce(true);
    const okRes = await verifySmtpConnection();
    expect(okRes.ok).toBe(true);
    expect(okRes.host).toBe('mail.jobiest.com');
  });

  it('never leaks API keys or SMTP passwords in GET /api/admin/email and blocks external recipients on POST', async () => {
    mockEnv.SMTP_HOST = 'mail.jobiest.com';
    mockEnv.BREVO_API_KEY = 'xkeysib-top-secret-brevo';
    mockEnv.RESEND_API_KEY = 're_top_secret_resend';

    requirePermMock.mockResolvedValueOnce({
      user: { id: 'owner-1', email: 'owner@gmail.com' },
      admin: { userId: 'owner-1', role: 'OWNER', isOwner: true },
    });

    const getRes = await adminEmailGet(new Request('https://jobiest.com/api/admin/email'));
    expect(getRes.status).toBe(200);
    const bodyText = await getRes.text();
    expect(bodyText).not.toContain('xkeysib-top-secret-brevo');
    expect(bodyText).not.toContain('re_top_secret_resend');
    expect(bodyText).not.toContain('super-secret-smtp-password');

    // Rule #13 check: external customer email is blocked from QA test send
    requireOwnerMock.mockResolvedValue({
      user: { id: 'owner-1', email: 'owner@gmail.com' },
      admin: { userId: 'owner-1', role: 'OWNER', isOwner: true },
    });

    const badPost = await adminEmailPost(
      new Request('https://jobiest.com/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_test',
          recipient: 'random-customer@yahoo.com',
        }),
      }),
    );
    expect(badPost.status).toBe(400);
    const badJson = await badPost.json();
    expect(badJson.error).toBe('RECIPIENT_NOT_AUTHORIZED_FOR_QA');

    // Authorized @jobiest.com mailbox succeeds and appends immutable audit log
    sendMailMock.mockResolvedValueOnce({ messageId: '<diag-ok@jobiest.com>' });
    const goodPost = await adminEmailPost(
      new Request('https://jobiest.com/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_test',
          recipient: 'philip@jobiest.com',
          preferredProvider: 'smtp',
        }),
      }),
    );
    expect(goodPost.status).toBe(200);
    const goodJson = await goodPost.json();
    expect(goodJson.ok).toBe(true);
    expect(goodJson.provider).toBe('smtp');
    expect(auditLogMock).toHaveBeenCalledTimes(1);
  });

  it('provisions staff @jobiest.com mailboxes with salted $scrypt$ hashes without logging plaintext passwords', async () => {
    mockEnv.STALWART_API_URL = 'https://mail.jobiest.com';
    mockEnv.STALWART_ADMIN_USER = 'postmaster';
    mockEnv.STALWART_ADMIN_PASSWORD = 'stalwart-admin-secret';

    requireOwnerMock.mockResolvedValue({
      user: { id: 'owner-1', email: 'owner@gmail.com' },
      admin: { userId: 'owner-1', role: 'OWNER', isOwner: true },
    });

    const stalwartBodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.method || init.method === 'GET') {
          return new Response('', { status: 404 });
        }
        stalwartBodies.push(String(init.body ?? ''));
        return new Response(JSON.stringify({ data: 1 }), { status: 200 });
      }),
    );

    const res = await adminEmailPost(
      new Request('https://jobiest.com/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'provision_mailbox',
          localPart: 'ada.okafor',
          displayName: 'Adaobi Okafor (Customer Support)',
          quotaGb: 3,
          password: 'TempStaffPassword!2026',
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.mailbox.mode).toBe('live_api');
    expect(json.mailbox.action).toBe('CREATED');
    expect(json.mailbox.email).toBe('ada.okafor@jobiest.com');
    expect(json.mailbox.webmailUrl).toBe('https://webmail.jobiest.com');

    // Verify Stalwart received only a salted $scrypt$ PHC hash, NEVER plaintext!
    expect(stalwartBodies).toHaveLength(1);
    expect(stalwartBodies[0]).toContain('$scrypt$ln=14,r=8,p=1$');
    expect(stalwartBodies[0]).not.toContain('TempStaffPassword!2026');

    // Verify audit log never contains plaintext password or hash!
    expect(auditLogMock).toHaveBeenCalledTimes(1);
    const auditPayload = JSON.stringify(auditLogMock.mock.calls[0]);
    expect(auditPayload).not.toContain('TempStaffPassword!2026');
    expect(auditPayload).not.toContain('$scrypt$');
  });
});
