import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Short-lived PII reveal tokens (Master Implementation Package §5.3, B-063).
 *
 * An admin re-authenticates with their password; the server issues a token
 * bound to (admin id, expiry) with an HMAC. Stateless - no server-side
 * session store - and scoped: a token is only valid for the admin it was
 * issued to, for five minutes, and every use is separately audit-logged
 * fail-closed by the consuming endpoint.
 */

export const REVEAL_TTL_SECONDS = 300;

function secret(): string {
  return env.ENCRYPTION_MASTER_KEY;
}

function signature(adminId: string, exp: number): string {
  return createHmac('sha256', secret()).update(`${adminId}:${exp}`).digest('hex');
}

/** Issue a reveal token for `adminId`, valid for REVEAL_TTL_SECONDS. */
export function issueRevealToken(adminId: string, now = Date.now()): { token: string; expiresIn: number } {
  const exp = Math.floor((now + REVEAL_TTL_SECONDS * 1000) / 1000);
  return { token: `${exp}.${signature(adminId, exp)}`, expiresIn: REVEAL_TTL_SECONDS };
}

/** Constant-time token verification for a given admin. */
export function verifyRevealToken(token: string, adminId: string, now = Date.now()): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const exp = parseInt(parts[0] ?? '', 10);
  if (!Number.isFinite(exp) || exp < Math.floor(now / 1000)) return false;
  const expected = signature(adminId, exp);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parts[1] ?? '', 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
