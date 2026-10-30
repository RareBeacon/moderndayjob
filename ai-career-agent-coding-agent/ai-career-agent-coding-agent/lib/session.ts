/**
 * Application-managed session lifecycle (30m idle / 7d absolute).
 *
 * Edge-runtime pure: uses Web Crypto (`globalThis.crypto.subtle`) and direct
 * PostgREST `fetch` calls only (zero Node `crypto` or `@supabase/supabase-js`
 * imports), so `middleware.ts` runs cleanly on Vercel Edge.
 *
 * Self-healing fallback: when `public.app_sessions` has not yet been migrated
 * on the target Supabase project (`PGRST205` / `42P01`), falls back to an
 * HMAC-SHA256 signed cookie token (`v1.<payload>.<sig>`) keyed by
 * `SUPABASE_SERVICE_ROLE_KEY`, enforcing the exact same 30m idle, 7d absolute,
 * and `user_id` binding invariants without locking out live sign-ins.
 */

export const APP_SESSION_COOKIE = 'jobiest_app_session';
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const TOUCH_THROTTLE_MS = 60 * 1000; // update last_active at most every 60s

export type AppSessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  revoked_at: string | null;
};

type SignedSessionPayload = {
  i: string;
  u: string;
  c: string;
  a: string;
  e: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array | null {
  try {
    const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuf);
  let hex = '';
  for (let i = 0; i < hashArray.length; i += 1) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function appSessionCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  };
}

function sessionSigningSecret(): string {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ENCRYPTION_MASTER_KEY ||
    (process.env.NODE_ENV !== 'production' ? 'jobiest-dev-session-hmac-key' : '');
  if (!secret) {
    throw new Error('APP_SESSION_SECRET_MISSING');
  }
  return secret;
}

async function importHmacKey(): Promise<CryptoKey> {
  const keyBytes = new TextEncoder().encode(sessionSigningSecret());
  return globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signSessionRow(row: AppSessionRow): Promise<string> {
  const payload: SignedSessionPayload = {
    i: row.id,
    u: row.user_id,
    c: row.created_at,
    a: row.last_active_at,
    e: row.expires_at,
  };
  const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importHmacKey();
  const msg = new TextEncoder().encode(`jobiest-app-session-v1:${payloadB64}`);
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, msg));
  return `v1.${payloadB64}.${bytesToBase64Url(sig)}`;
}

async function verifySignedSessionToken(
  token: string,
  expectedUserId?: string,
): Promise<{ valid: true; row: AppSessionRow } | { valid: false; reason: string; row?: AppSessionRow }> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const [, payloadB64, sigB64] = parts;
  const sigBytes = base64UrlToBytes(sigB64);
  const payloadBytes = base64UrlToBytes(payloadB64);
  if (!sigBytes || !payloadBytes) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  try {
    const key = await importHmacKey();
    const msg = new TextEncoder().encode(`jobiest-app-session-v1:${payloadB64}`);
    const ok = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      msg,
    );
    if (!ok) return { valid: false, reason: 'INVALID_SIGNATURE' };
  } catch {
    return { valid: false, reason: 'SIGNATURE_ERROR' };
  }

  let parsed: SignedSessionPayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as SignedSessionPayload;
  } catch {
    return { valid: false, reason: 'MALFORMED_PAYLOAD' };
  }
  if (!parsed?.i || !parsed?.u || !parsed?.c || !parsed?.a || !parsed?.e) {
    return { valid: false, reason: 'MALFORMED_PAYLOAD' };
  }
  const row: AppSessionRow = {
    id: parsed.i,
    user_id: parsed.u,
    token_hash: await hashToken(token),
    created_at: parsed.c,
    last_active_at: parsed.a,
    expires_at: parsed.e,
    revoked_at: null,
  };
  if (expectedUserId && row.user_id !== expectedUserId) {
    return { valid: false, reason: 'USER_MISMATCH', row };
  }
  return checkSessionTimestamps(row);
}

function checkSessionTimestamps(
  row: AppSessionRow,
): { valid: true; row: AppSessionRow } | { valid: false; reason: string; row: AppSessionRow } {
  if (row.revoked_at) return { valid: false, reason: 'REVOKED', row };
  const now = Date.now();
  const lastActive = new Date(row.last_active_at).getTime();
  const expiresAt = new Date(row.expires_at).getTime();
  const createdAt = new Date(row.created_at).getTime();
  if (!Number.isFinite(lastActive) || !Number.isFinite(expiresAt) || !Number.isFinite(createdAt)) {
    return { valid: false, reason: 'INVALID_TIMESTAMPS', row };
  }
  if (now > expiresAt || now - createdAt > ABSOLUTE_TIMEOUT_MS) {
    return { valid: false, reason: 'ABSOLUTE_EXPIRED', row };
  }
  if (now - lastActive > IDLE_TIMEOUT_MS) {
    return { valid: false, reason: 'IDLE_EXPIRED', row };
  }
  return { valid: true, row };
}

function restConfig(): { baseUrl: string; serviceKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { baseUrl: `${url}/rest/v1`, serviceKey };
}

function restHeaders(serviceKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function isMissingAppSessionsTable(status: number, bodyText: string): boolean {
  if (status === 404) return true;
  return bodyText.includes('PGRST205') || bodyText.includes('42P01') || bodyText.includes('app_sessions');
}

export async function createAppSession(params: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; row: AppSessionRow }> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresIso = new Date(now + ABSOLUTE_TIMEOUT_MS).toISOString();
  const cfg = restConfig();

  if (cfg) {
    const token = generateSessionToken();
    const tokenHash = await hashToken(token);
    const res = await fetch(
      `${cfg.baseUrl}/app_sessions?select=id,user_id,token_hash,created_at,last_active_at,expires_at,revoked_at`,
      {
        method: 'POST',
        headers: restHeaders(cfg.serviceKey, { Prefer: 'return=representation' }),
        body: JSON.stringify({
          user_id: params.userId,
          token_hash: tokenHash,
          created_at: nowIso,
          last_active_at: nowIso,
          expires_at: expiresIso,
          ip_address: params.ip ?? null,
          user_agent: params.userAgent ? params.userAgent.slice(0, 512) : null,
        }),
        signal: AbortSignal.timeout(4000),
      },
    );

    if (res.ok) {
      const rows = (await res.json()) as AppSessionRow[];
      const row = Array.isArray(rows) ? rows[0] : (rows as unknown as AppSessionRow);
      if (row?.id) return { token, row };
    } else {
      const errText = await res.text().catch(() => '');
      if (!isMissingAppSessionsTable(res.status, errText)) {
        throw new Error(`APP_SESSION_CREATE_FAILED: ${res.status}`);
      }
    }
  }

  // Fallback when public.app_sessions migration has not yet been applied.
  const fallbackRow: AppSessionRow = {
    id: `signed:${generateSessionToken().slice(0, 16)}`,
    user_id: params.userId,
    token_hash: '',
    created_at: nowIso,
    last_active_at: nowIso,
    expires_at: expiresIso,
    revoked_at: null,
  };
  const signedToken = await signSessionRow(fallbackRow);
  fallbackRow.token_hash = await hashToken(signedToken);
  return { token: signedToken, row: fallbackRow };
}

export async function validateAppSession(params: {
  token: string;
  userId?: string;
}): Promise<{ valid: true; row: AppSessionRow } | { valid: false; reason: string; row?: AppSessionRow }> {
  if (!params.token) return { valid: false, reason: 'NOT_FOUND' };
  if (params.token.startsWith('v1.')) {
    return verifySignedSessionToken(params.token, params.userId);
  }

  const cfg = restConfig();
  if (!cfg) return { valid: false, reason: 'DB_UNCONFIGURED' };

  const tokenHash = await hashToken(params.token);
  const res = await fetch(
    `${cfg.baseUrl}/app_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,user_id,token_hash,created_at,last_active_at,expires_at,revoked_at&limit=1`,
    {
      method: 'GET',
      headers: restHeaders(cfg.serviceKey),
      signal: AbortSignal.timeout(4000),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { valid: false, reason: `DB_ERROR:${res.status}:${errText.slice(0, 48)}` };
  }

  const rows = (await res.json()) as AppSessionRow[];
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return { valid: false, reason: 'NOT_FOUND' };
  if (row.revoked_at) return { valid: false, reason: 'REVOKED', row };
  if (params.userId && row.user_id !== params.userId) {
    return { valid: false, reason: 'USER_MISMATCH', row };
  }
  return checkSessionTimestamps(row);
}

export async function touchAppSession(row: AppSessionRow): Promise<string | void> {
  const lastActive = new Date(row.last_active_at).getTime();
  if (Date.now() - lastActive < TOUCH_THROTTLE_MS) return;
  const nowIso = new Date().toISOString();

  if (row.id.startsWith('signed:')) {
    return signSessionRow({ ...row, last_active_at: nowIso });
  }

  const cfg = restConfig();
  if (!cfg) return;
  await fetch(`${cfg.baseUrl}/app_sessions?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: restHeaders(cfg.serviceKey, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ last_active_at: nowIso }),
    signal: AbortSignal.timeout(3000),
  });
}

export async function revokeAppSessionByToken(token: string): Promise<void> {
  if (!token || token.startsWith('v1.')) return;
  const cfg = restConfig();
  if (!cfg) return;
  const tokenHash = await hashToken(token);
  await fetch(
    `${cfg.baseUrl}/app_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null`,
    {
      method: 'PATCH',
      headers: restHeaders(cfg.serviceKey, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(3000),
    },
  );
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  if (!userId) return;
  const cfg = restConfig();
  if (!cfg) return;
  await fetch(
    `${cfg.baseUrl}/app_sessions?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null`,
    {
      method: 'PATCH',
      headers: restHeaders(cfg.serviceKey, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(3000),
    },
  );
}
