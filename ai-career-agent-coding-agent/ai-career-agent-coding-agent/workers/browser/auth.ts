import crypto from 'node:crypto';

/**
 * Authorization for the browser worker's /submit endpoint. The worker has no
 * database credentials and only two routes (/healthz, POST /submit); this
 * single shared secret is the entire gate between the web app and the
 * isolated browser service. Fails closed: no secret configured = deny
 * everyone. The comparison is timing-safe.
 */
export function isAuthorizedHeader(header: string | undefined, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
