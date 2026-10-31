import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ABSOLUTE_TIMEOUT_MS,
  APP_SESSION_COOKIE,
  IDLE_TIMEOUT_MS,
  TOUCH_THROTTLE_MS,
  appSessionCookieOptions,
  createAppSession,
  generateSessionToken,
  hashToken,
  revokeAllUserSessions,
  revokeAppSessionByToken,
  touchAppSession,
  validateAppSession,
  type AppSessionRow,
} from '../lib/session';

describe('app session policy (30m idle / 7d absolute)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('generates opaque token and hashes deterministically', async () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(20);
    const h1 = await hashToken(token);
    const h2 = await hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hash differs for different tokens', async () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(await hashToken(a)).not.toBe(await hashToken(b));
  });

  it('constants and cookie options match approved session policy', () => {
    expect(APP_SESSION_COOKIE).toBe('jobiest_app_session');
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(ABSOLUTE_TIMEOUT_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(TOUCH_THROTTLE_MS).toBe(60 * 1000);
    const opts = appSessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect('maxAge' in opts).toBe(false);
  });

  it('validates an active DB-backed session within 30m idle and 7d absolute limits', async () => {
    const now = Date.now();
    const token = generateSessionToken();
    const tokenHash = await hashToken(token);
    const dbRow: AppSessionRow = {
      id: 'sess-active-1',
      user_id: 'user-123',
      token_hash: tokenHash,
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      last_active_at: new Date(now - 29 * 60 * 1000).toISOString(),
      expires_at: new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString(),
      revoked_at: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([dbRow]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const res = await validateAppSession({ token, userId: 'user-123' });
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.row.id).toBe('sess-active-1');
    }
  });

  it('rejects DB-backed session with IDLE_EXPIRED after 30 minutes of inactivity', async () => {
    const now = Date.now();
    const token = generateSessionToken();
    const tokenHash = await hashToken(token);
    const dbRow: AppSessionRow = {
      id: 'sess-idle-1',
      user_id: 'user-123',
      token_hash: tokenHash,
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      last_active_at: new Date(now - IDLE_TIMEOUT_MS - 1_000).toISOString(),
      expires_at: new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString(),
      revoked_at: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([dbRow]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const res = await validateAppSession({ token, userId: 'user-123' });
    expect(res).toMatchObject({ valid: false, reason: 'IDLE_EXPIRED' });
  });

  it('rejects DB-backed session with ABSOLUTE_EXPIRED after 7 days even if active 1 minute ago', async () => {
    const now = Date.now();
    const token = generateSessionToken();
    const tokenHash = await hashToken(token);
    const createdAt = now - ABSOLUTE_TIMEOUT_MS - 5_000;
    const dbRow: AppSessionRow = {
      id: 'sess-abs-1',
      user_id: 'user-123',
      token_hash: tokenHash,
      created_at: new Date(createdAt).toISOString(),
      last_active_at: new Date(now - 60_000).toISOString(),
      expires_at: new Date(createdAt + ABSOLUTE_TIMEOUT_MS).toISOString(),
      revoked_at: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([dbRow]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const res = await validateAppSession({ token, userId: 'user-123' });
    expect(res).toMatchObject({ valid: false, reason: 'ABSOLUTE_EXPIRED' });
  });

  it('rejects revoked sessions and cross-user session replay (USER_MISMATCH)', async () => {
    const now = Date.now();
    const token = generateSessionToken();
    const tokenHash = await hashToken(token);
    const baseRow: AppSessionRow = {
      id: 'sess-sec-1',
      user_id: 'user-owner',
      token_hash: tokenHash,
      created_at: new Date(now - 60_000).toISOString(),
      last_active_at: new Date(now - 10_000).toISOString(),
      expires_at: new Date(now + ABSOLUTE_TIMEOUT_MS).toISOString(),
      revoked_at: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify([baseRow]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const mismatch = await validateAppSession({ token, userId: 'user-other-tenant' });
    expect(mismatch).toMatchObject({ valid: false, reason: 'USER_MISMATCH' });

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ ...baseRow, revoked_at: new Date(now - 1_000).toISOString() }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const revoked = await validateAppSession({ token, userId: 'user-owner' });
    expect(revoked).toMatchObject({ valid: false, reason: 'REVOKED' });
  });

  it('throttles touchAppSession within 60s and updates last_active_at after 60s', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;

    const now = Date.now();
    const freshRow: AppSessionRow = {
      id: 'sess-touch-1',
      user_id: 'user-1',
      token_hash: 'h',
      created_at: new Date(now - 120_000).toISOString(),
      last_active_at: new Date(now - 15_000).toISOString(),
      expires_at: new Date(now + ABSOLUTE_TIMEOUT_MS).toISOString(),
      revoked_at: null,
    };
    await touchAppSession(freshRow);
    expect(fetchMock).not.toHaveBeenCalled();

    const staleTouchRow: AppSessionRow = {
      ...freshRow,
      last_active_at: new Date(now - 90_000).toISOString(),
    };
    await touchAppSession(staleTouchRow);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/app_sessions?id=eq.sess-touch-1');
  });

  it('falls back to HMAC-signed token when app_sessions is missing and rejects tampering', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'PGRST205', message: 'Could not find the table public.app_sessions' }), {
        status: 404,
      }),
    );

    const created = await createAppSession({ userId: 'user-fallback-1', ip: '127.0.0.1', userAgent: 'Vitest' });
    expect(created.token.startsWith('v1.')).toBe(true);

    const valid = await validateAppSession({ token: created.token, userId: 'user-fallback-1' });
    expect(valid.valid).toBe(true);

    const wrongUser = await validateAppSession({ token: created.token, userId: 'user-other' });
    expect(wrongUser).toMatchObject({ valid: false, reason: 'USER_MISMATCH' });

    const parts = created.token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}AA`;
    const badSig = await validateAppSession({ token: tampered, userId: 'user-fallback-1' });
    expect(badSig).toMatchObject({ valid: false, reason: 'INVALID_SIGNATURE' });
  });

  it('revokes single token or all user sessions via PostgREST PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;

    const token = generateSessionToken();
    await revokeAppSessionByToken(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('token_hash=eq.');

    await revokeAllUserSessions('user-revoke-all');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('user_id=eq.user-revoke-all');
  });
});
