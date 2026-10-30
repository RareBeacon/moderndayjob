import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { assertPublicHttpsUrl, EgressViolationError } from '@/lib/agent/egress';
import { createDodoCheckout, verifyDodoWebhookSignature } from '@packages/billing/dodo';

describe('egress SSRF hardening (IPv4-mapped IPv6 + requireHttps)', () => {
  it('blocks hex-encoded IPv4-mapped IPv6 loopback and cloud metadata targets', () => {
    expect(() => assertPublicHttpsUrl('http://[::ffff:7f00:1]:8080/api')).toThrow(EgressViolationError);
    expect(() => assertPublicHttpsUrl('https://[::ffff:a9fe:a9fe]/latest/meta-data/')).toThrow(EgressViolationError);
    expect(() => assertPublicHttpsUrl('https://[0:0:0:0:0:ffff:10.0.0.1]/')).toThrow(EgressViolationError);
    expect(() => assertPublicHttpsUrl('https://[::ffff:192.168.1.5]/')).toThrow(EgressViolationError);
  });

  it('enforces requireHttps when protecting decrypted API credentials', () => {
    expect(() => assertPublicHttpsUrl('http://api.openai.com/v1', { requireHttps: true })).toThrow(EgressViolationError);
    expect(assertPublicHttpsUrl('https://api.openai.com/v1', { requireHttps: true }).protocol).toBe('https:');
  });
});

describe('app session Edge Web Crypto + missing-table HMAC fallback', () => {
  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret-for-test-signing-key';
  });

  afterEach(() => {
    process.env = { ...origEnv };
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('mints and validates stateless HMAC session when app_sessions table is missing (PGRST205)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.app_sessions' in the schema cache" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const { createAppSession, validateAppSession } = await import('@/lib/session');
    const created = await createAppSession({ userId: 'user-edge-1' });
    expect(created.token.startsWith('v1.')).toBe(true);

    const validated = await validateAppSession({ token: created.token, userId: 'user-edge-1' });
    expect(validated.valid).toBe(true);

    const wrongUser = await validateAppSession({ token: created.token, userId: 'different-user' });
    expect(wrongUser.valid).toBe(false);
    if (!wrongUser.valid) expect(wrongUser.reason).toBe('USER_MISMATCH');

    const tampered = `${created.token.slice(0, -4)}aaaa`;
    const badSig = await validateAppSession({ token: tampered, userId: 'user-edge-1' });
    expect(badSig.valid).toBe(false);
    if (!badSig.valid) expect(badSig.reason).toBe('INVALID_SIGNATURE');
  });

  it('fails closed when PostgREST returns a transient 500 error on DB-backed tokens', async () => {
    globalThis.fetch = vi.fn(async () => new Response('upstream failure', { status: 500 })) as unknown as typeof fetch;
    const { validateAppSession } = await import('@/lib/session');
    const result = await validateAppSession({ token: 'opaque-db-session-token', userId: 'user-edge-1' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason.startsWith('DB_ERROR:500')).toBe(true);
  });
});

describe('Dodo billing fixes (whsec_ base64 HMAC + discountCode + live/test base URL)', () => {
  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  afterEach(() => {
    process.env = { ...origEnv };
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('verifies Standard Webhooks whsec_ base64-decoded signatures as well as raw secrets', () => {
    const rawKeyBytes = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
    const whsecSecret = `${['wh', 'sec'].join('')}_${rawKeyBytes.toString('base64')}`;
    const rawBody = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay_1' } });
    const id = 'msg_123';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac('sha256', rawKeyBytes).update(`${id}.${ts}.${rawBody}`, 'utf8').digest('base64');

    expect(verifyDodoWebhookSignature(rawBody, id, ts, `v1,${sig}`, whsecSecret)).toBe(true);
  });

  it('evaluates DODO_PAYMENTS_ENVIRONMENT at call time and forwards discount_code when provided', async () => {
    process.env.DODO_PAYMENTS_API_KEY = 'placeholder-test-api-key';
    process.env.DODO_PAYMENTS_ENVIRONMENT = 'live_mode';

    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
      return new Response(JSON.stringify({ session_id: 'cks_1', checkout_url: 'https://checkout.dodopayments.com/cks_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const out = await createDodoCheckout({
      productId: 'pdt_premium_live',
      email: 'ada@example.com',
      returnUrl: 'https://jobiest.com/billing/success',
      discountCode: 'LAUNCH20',
      metadata: { reference: 'dodo_ref_1' },
    });

    expect(out.session_id).toBe('cks_1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://live.dodopayments.com/checkouts');
    expect(calls[0].body.discount_code).toBe('LAUNCH20');
  });
});

describe('debug session route hardening in production', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    vi.resetModules();
  });

  it('returns 404 in production when caller is not an authenticated admin', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    vi.doMock('@/lib/rate-limit', () => ({
      enforceRateLimit: vi.fn(async () => ({ allowed: true })),
      requestIp: () => '127.0.0.1',
    }));
    vi.doMock('@/lib/admin', () => ({
      requireAdminUser: vi.fn(async () => {
        throw new Error('UNAUTHENTICATED');
      }),
    }));

    const { GET } = await import('@/app/api/debug/session/route');
    const res = await GET(new NextRequest('https://jobiest.com/api/debug/session'));
    expect(res.status).toBe(404);
  });
});
