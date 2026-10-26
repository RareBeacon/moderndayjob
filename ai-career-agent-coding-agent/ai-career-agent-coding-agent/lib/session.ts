import { createHash, randomBytes } from 'crypto';
import { supabaseAdmin } from './supabase';

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

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function appSessionCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    // No maxAge / expires -> session cookie (deleted when browser session ends)
  };
}

export async function createAppSession(params: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; row: AppSessionRow }> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const { data, error } = await supabaseAdmin
    .from('app_sessions')
    .insert({
      user_id: params.userId,
      token_hash: tokenHash,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ABSOLUTE_TIMEOUT_MS).toISOString(),
      ip_address: params.ip ?? null,
      user_agent: params.userAgent ? params.userAgent.slice(0, 512) : null,
    })
    .select('id, user_id, token_hash, created_at, last_active_at, expires_at, revoked_at')
    .single();
  if (error) throw new Error(`APP_SESSION_CREATE_FAILED: ${error.message}`);
  return { token, row: data as AppSessionRow };
}

export async function validateAppSession(params: {
  token: string;
  userId?: string;
}): Promise<{ valid: true; row: AppSessionRow } | { valid: false; reason: string; row?: AppSessionRow }> {
  const tokenHash = hashToken(params.token);
  const { data, error } = await supabaseAdmin
    .from('app_sessions')
    .select('id, user_id, token_hash, created_at, last_active_at, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) return { valid: false, reason: 'DB_ERROR' };
  if (!data) return { valid: false, reason: 'NOT_FOUND' };
  const row = data as AppSessionRow;
  if (row.revoked_at) return { valid: false, reason: 'REVOKED', row };
  if (params.userId && row.user_id !== params.userId) return { valid: false, reason: 'USER_MISMATCH', row };
  const now = Date.now();
  const lastActive = new Date(row.last_active_at).getTime();
  const expiresAt = new Date(row.expires_at).getTime();
  const createdAt = new Date(row.created_at).getTime();
  // Absolute check: if expires_at passed or created_at + 7d passed (defense in depth)
  if (now > expiresAt) return { valid: false, reason: 'ABSOLUTE_EXPIRED', row };
  if (now - createdAt > ABSOLUTE_TIMEOUT_MS) return { valid: false, reason: 'ABSOLUTE_EXPIRED', row };
  // Idle check: 30 minutes since last qualifying activity
  if (now - lastActive > IDLE_TIMEOUT_MS) return { valid: false, reason: 'IDLE_EXPIRED', row };
  return { valid: true, row };
}

export async function touchAppSession(row: AppSessionRow): Promise<void> {
  const lastActive = new Date(row.last_active_at).getTime();
  if (Date.now() - lastActive < TOUCH_THROTTLE_MS) return;
  await supabaseAdmin
    .from('app_sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', row.id);
}

export async function revokeAppSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await supabaseAdmin
    .from('app_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('revoked_at', null);
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await supabaseAdmin
    .from('app_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);
}

export async function revokeExpiredSessions(): Promise<void> {
  // Called optionally via cron; not required for correctness (expired sessions are rejected on validate)
  const nowIso = new Date().toISOString();
  // No-op placeholder: validation already rejects, cleanup can run via SQL cron
}
