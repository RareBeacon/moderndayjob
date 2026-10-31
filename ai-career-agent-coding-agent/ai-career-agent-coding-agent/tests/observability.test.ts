import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import {
  CORRELATION_HEADER,
  classifyError,
  logServerEvent,
  resolveRequestId,
} from '../lib/observability';

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  requestIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

const auditSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit', async () => {
  const actual = await vi.importActual<typeof import('../lib/audit')>('../lib/audit');
  return {
    ...actual,
    auditEvent: (...args: unknown[]) => auditSpy(...args),
  };
});

describe('observability, correlation IDs, and error classification', () => {
  it('reuses valid incoming x-request-id or x-vercel-id and sanitizes unsafe headers', () => {
    const direct = new Request('https://jobiest.com/api/health', {
      headers: { [CORRELATION_HEADER]: 'req_prod_20261031_abcd12' },
    });
    expect(resolveRequestId(direct)).toBe('req_prod_20261031_abcd12');

    const vercel = new Request('https://jobiest.com/api/health', {
      headers: { 'x-vercel-id': 'fra1::iad1::9f8e7d-1730368000' },
    });
    expect(resolveRequestId(vercel)).toBe('fra1::iad1::9f8e7d-1730368000');

    const unsafe = new Request('https://jobiest.com/api/health', {
      headers: { [CORRELATION_HEADER]: 'bad id with spaces <script>alert(1)</script>' },
    });
    const fallback = resolveRequestId(unsafe);
    expect(fallback).not.toContain(' ');
    expect(fallback).not.toContain('<');
    expect(fallback.length).toBeGreaterThanOrEqual(16);
  });

  it('classifies errors deterministically across operational categories', () => {
    expect(classifyError(new Error('UNAUTHENTICATED'))).toBe('AUTH');
    expect(classifyError(new Error('SESSION_IDLE_EXPIRED'))).toBe('AUTH');
    expect(classifyError(new Error('RATE_LIMITED'))).toBe('RATE_LIMIT');
    expect(classifyError(new Error('CREDIT_EXHAUSTED:DOCUMENT'))).toBe('ENTITLEMENT');
    expect(classifyError(new ZodError([]))).toBe('VALIDATION');
    expect(classifyError({ code: 'PGRST205', message: 'table missing' })).toBe('DATABASE');
    expect(classifyError(new Error('TypeError: fetch failed ECONNREFUSED'))).toBe('NETWORK');
    expect(classifyError(new Error('PAYSTACK_UPSTREAM_502'))).toBe('EXTERNAL_API');
    expect(classifyError(new Error('something unexpected'))).toBe('INTERNAL');
  });

  it('emits structured JSON logs and redacts secret values', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logServerEvent('error', 'billing.webhook.failed', {
      requestId: 'req-corr-001',
      route: '/api/billing/paystack/webhook',
      error: new Error('Authorization: Bearer super_secret_jwt_value failed against postgres'),
      meta: {
        authorization: 'Bearer raw-secret',
        note: 'api_key=sk_live_999999999999',
        safeField: 'paystack',
      },
    });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(errSpy.mock.calls[0][0])) as Record<string, unknown>;
    expect(logged.requestId).toBe('req-corr-001');
    expect(logged.category).toBe('DATABASE');
    expect(String(logged.errorMessage)).not.toContain('super_secret_jwt_value');
    expect(JSON.stringify(logged.meta)).not.toContain('raw-secret');
    expect(JSON.stringify(logged.meta)).not.toContain('sk_live_999999999999');
    expect((logged.meta as Record<string, unknown>).safeField).toBe('paystack');
    errSpy.mockRestore();
  });

  it('propagates x-request-id in /api/client-error and records requestId in auditEvent', async () => {
    const { POST } = await import('../app/api/client-error/route');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = new Request('https://jobiest.com/api/client-error', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CORRELATION_HEADER]: 'corr-client-err-42',
      },
      body: JSON.stringify({
        message: 'dashboard:test boundary check',
        digest: '1014877456',
        path: '/dashboard',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get(CORRELATION_HEADER)).toBe('corr-client-err-42');
    const json = (await res.json()) as { ok: boolean; requestId: string };
    expect(json).toEqual({ ok: true, requestId: 'corr-client-err-42' });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLIENT_ERROR',
        requestId: 'corr-client-err-42',
      }),
    );
    warnSpy.mockRestore();
  });

  it('dashboard error boundary never forces raw error details open in production', () => {
    const src = readFileSync('app/(dashboard)/dashboard/error.tsx', 'utf-8');
    expect(src).not.toContain('|| true');
    expect(src).toContain("process.env.NODE_ENV !== 'production'");
    expect(src).toContain('Reference:');
  });
});
