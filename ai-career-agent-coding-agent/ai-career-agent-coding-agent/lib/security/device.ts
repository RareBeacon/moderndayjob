import crypto from 'node:crypto';

/**
 * Minimal device-identity + anti-abuse primitives (security spec 29-31).
 *
 * A "device" here is a server-generated random id delivered in an HttpOnly,
 * SameSite cookie. It is ONLY an abuse-prevention signal; it is deliberately
 * NOT treated as "one device equals one human" (shared devices are common).
 * Raw IPs and emails are never stored: signals are one-way hashed.
 */

export const DEVICE_COOKIE = 'jobiest_dvc';

/** Server-generated random device id (not derived from userAgent+IP). */
export function issueDeviceId(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Read the device id from the request cookies, if present. */
export function readDeviceId(req: Request): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === DEVICE_COOKIE) {
      const v = decodeURIComponent(rest.join('='));
      return v || null;
    }
  }
  return null;
}

/** One-way pseudonymization for IP/email signals stored as counter keys. */
export function hashSignal(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
