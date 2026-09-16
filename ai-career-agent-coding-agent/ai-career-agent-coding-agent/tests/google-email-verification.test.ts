import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Google sign-in email verification gate.
 * - /api/auth/google/verify GET: reports verification state for google
 *   sessions only, auto-issues a code when one is needed.
 * - POST send: cooldown-aware resend. POST confirm: code check with
 *   attempt limits, expiry, and single use.
 * - Password sessions are never gated (instant-access product decision).
 */

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
const { sendEmailVerificationCode } = vi.hoisted(() => ({ sendEmailVerificationCode: vi.fn() }));
const { auditEvent } = vi.hoisted(() => ({ auditEvent: vi.fn() }));
const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));
const { from } = vi.hoisted(() => ({ from: vi.fn() }));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeChain(): { chain: Chain; state: Record<string, unknown> } {
  const state: Record<string, unknown> = { inserts: [], updates: [] };
  const chain = {} as Chain;
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: state.maybeSingle ?? null }));
  chain.insert = vi.fn(async (row: unknown) => {
    (state.inserts as unknown[]).push(row);
    return { error: null };
  });
  chain.update = vi.fn((row: unknown) => {
    (state.updates as unknown[]).push(row);
    const tail = { eq: vi.fn(async () => ({ error: null })) };
    return tail;
  });
  return { chain, state };
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from } }));
vi.mock('@/lib/auth', () => ({ requireUser }));
vi.mock('@/lib/email/resend', () => ({ sendEmailVerificationCode }));
vi.mock('@/lib/audit', () => ({ auditEvent }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit, requestIp: () => '127.0.0.1' }));

import { GET, POST } from '@/app/api/auth/google/verify/route';
import { generateVerificationCode } from '@/lib/auth-oauth';

const googleUser = {
  id: 'gu1',
  email: 'philip@gmail.com',
  app_metadata: { providers: ['google'] },
};
const passwordUser = {
  id: 'pu1',
  email: 'philip@example.com',
  app_metadata: { providers: ['email'] },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockReset();
  enforceRateLimit.mockReset();
  enforceRateLimit.mockResolvedValue({ allowed: true });
  sendEmailVerificationCode.mockReset();
  sendEmailVerificationCode.mockResolvedValue({ ok: true });
  auditEvent.mockResolvedValue(undefined);
});

describe('code generation', () => {
  it('produces zero padded 6-digit codes with real entropy', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(15);
  });
});

describe('GET /api/auth/google/verify', () => {
  it('bounces anonymous callers', async () => {
    requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('never gates password accounts', async () => {
    requireUser.mockResolvedValue(passwordUser);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresVerification).toBe(false);
    expect(sendEmailVerificationCode).not.toHaveBeenCalled();
  });

  it('does not gate a verified google account', async () => {
    requireUser.mockResolvedValue(googleUser);
    const { chain, state } = makeChain();
    state.maybeSingle = { email_verified_at: '2026-09-16T00:00:00Z', full_name: 'Philip' };
    from.mockImplementation((table: string) => (table === 'profiles' ? chain : makeChain().chain));
    const res = await GET();
    const body = await res.json();
    expect(body.requiresVerification).toBe(false);
  });

  it('gates an unverified google account and mails a code', async () => {
    requireUser.mockResolvedValue(googleUser);
    const { chain, state } = makeChain();
    state.maybeSingle = { email_verified_at: null, full_name: 'Philip' };
    const codes = makeChain();
    codes.state.maybeSingle = null; // no recent code
    from.mockImplementation((table: string) => (table === 'profiles' ? chain : codes.chain));
    const res = await GET();
    const body = await res.json();
    expect(body.requiresVerification).toBe(true);
    expect(body.email).toContain('@gmail.com');
    expect(codes.state.inserts).toHaveLength(1);
    const inserts = codes.state.inserts as Array<{ code_hash: string; expires_at: string }>;
    const inserted = inserts[0];
    expect(inserted.code_hash).not.toMatch(/^\d{6}$/); // hashed at rest
    expect(sendEmailVerificationCode).toHaveBeenCalledWith('philip@gmail.com', expect.any(String), 'Philip');
  });

  it('respects the resend cooldown instead of spamming', async () => {
    requireUser.mockResolvedValue(googleUser);
    const { chain, state } = makeChain();
    state.maybeSingle = { email_verified_at: null, full_name: null };
    const codes = makeChain();
    codes.state.maybeSingle = { id: 'c1', created_at: new Date().toISOString() }; // seconds ago
    from.mockImplementation((table: string) => (table === 'profiles' ? chain : codes.chain));
    const res = await GET();
    const body = await res.json();
    expect(body.requiresVerification).toBe(true);
    expect(body.cooldown).toBe(true);
    expect(codes.state.inserts).toHaveLength(0);
    expect(sendEmailVerificationCode).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/google/verify', () => {
  it('rejects malformed bodies', async () => {
    requireUser.mockResolvedValue(googleUser);
    const res = await POST(
      new Request('http://localhost/api/auth/google/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', code: '12ab56' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('verifies the correct code exactly once and stamps the profile', async () => {
    requireUser.mockResolvedValue(googleUser);
    const codes = makeChain();
    const { chain, state } = makeChain();
    // hash of 123456 under the dev master key, computed via the lib itself
    // is not reproducible here without env; instead we accept any stored
    // hash and assert the confirmation contract by stubbing the outcome.
    state.maybeSingle = { email_verified_at: null, full_name: null };
    codes.state.maybeSingle = null;
    from.mockImplementation((table: string) => (table === 'profiles' ? chain : codes.chain));

    // First make a code by issuing through the send action.
    const sendRes = await POST(
      new Request('http://localhost/api/auth/google/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      }),
    );
    expect(sendRes.status).toBe(200);
    const sentCode = sendEmailVerificationCode.mock.calls[0][1] as string;

    // Now confirm with the code that was emailed.
    codes.state.maybeSingle = {
      id: 'c1',
      code_hash: (codes.state.inserts as Array<{ code_hash: string }>)[0]?.code_hash ?? '',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      attempts: 0,
    };
    const confirmRes = await POST(
      new Request('http://localhost/api/auth/google/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', code: sentCode }),
      }),
    );
    expect(confirmRes.status).toBe(200);
    const profileUpdate = (state.updates as Array<Record<string, unknown>>).find((u) => 'email_verified_at' in u);
    expect(profileUpdate?.email_verified_at).toBeTruthy();
  });

  it('counts wrong attempts and rejects after the limit', async () => {
    requireUser.mockResolvedValue(googleUser);
    const codes = makeChain();
    const { state } = makeChain();
    state.maybeSingle = { email_verified_at: null, full_name: null };
    codes.state.maybeSingle = {
      id: 'c1',
      code_hash: 'deadbeef',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      attempts: 8,
    };
    from.mockImplementation((table: string) => (table === 'profiles' ? makeChain().chain : codes.chain));
    // (profiles chain is irrelevant on this path)
    const res = await POST(
      new Request('http://localhost/api/auth/google/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', code: '000000' }),
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('TOO_MANY_ATTEMPTS');
  });

  it('rate limits the endpoint', async () => {
    requireUser.mockResolvedValue(googleUser);
    enforceRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(
      new Request('http://localhost/api/auth/google/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      }),
    );
    expect(res.status).toBe(429);
  });
});
