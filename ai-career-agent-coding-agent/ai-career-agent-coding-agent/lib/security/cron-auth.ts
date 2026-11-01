import crypto from 'node:crypto';

/**
 * Constant-time comparison of `Authorization: Bearer <secret>` against CRON_SECRET.
 * Hashes both sides with SHA-256 first so secret length is never leaked via timing.
 */
export function timingSafeCronBearerMatch(authHeader: string | null, secret: string): boolean {
  if (!authHeader || !secret) return false;
  const expected = `Bearer ${secret}`;
  const aHash = crypto.createHash('sha256').update(authHeader, 'utf8').digest();
  const bHash = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(aHash, bHash);
}
