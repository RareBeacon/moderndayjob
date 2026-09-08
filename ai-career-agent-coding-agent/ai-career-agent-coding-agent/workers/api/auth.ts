import { timingSafeEqual } from 'node:crypto';

/**
 * API-key authorization for the self-hosted API gateway (Oracle Always Free).
 * Unlike the browser worker (single shared secret), the gateway serves *many*
 * customers, so it accepts a comma-separated list of keys (API_KEYS). One key
 * per customer — you can rotate or revoke a single tenant by removing its key.
 *
 * Fails closed: no keys configured ⇒ deny everyone. The comparison is
 * timing-safe per key; lengths are compared before the constant-time compare
 * (the length of a key is not secret).
 */
export function parseApiKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export function isAuthorizedApiKey(header: string | undefined, keys: string[]): boolean {
  if (!header || keys.length === 0) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const provided = Buffer.from(match[1]);
  for (const key of keys) {
    const expected = Buffer.from(key);
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      return true;
    }
  }
  return false;
}
