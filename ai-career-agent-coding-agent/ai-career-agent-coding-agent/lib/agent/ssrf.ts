import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Shared SSRF guard (Phase 8 — browser automation). One implementation, used
 * by the browser worker for every navigation AND unit-tested in isolation.
 *
 * Enforced here, in order:
 *  1. http/https only — no file:/gopher:/ftp: etc.
 *  2. no userinfo in the URL (http://user:pass@host is a credential exfil).
 *  3. block well-known internal hostnames (localhost, cloud metadata).
 *  4. optional domain allowlist (exact host or subdomain).
 *  5. block IP literals — including obfuscated decimal/hex/octal and
 *     IPv4-mapped IPv6 forms (classic SSRF bypasses).
 *  6. resolve the host and block ANY private/reserved address in the result
 *     (DNS rebinding can't hide behind one public answer if all are checked).
 */

export type LookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<{ address: string; family: number }[]>;

export const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'metadata',
  'metadata.google.internal',
  '169.254.169.254',
]);

/** True when the IP is loopback, private, link-local, CGNAT, benchmark,
 *  multicast or reserved (i.e. it must never be a navigation target). */
export function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const n = ip.toLowerCase();
  return (
    n === '::1' ||
    n === '::' ||
    n.startsWith('fc') ||
    n.startsWith('fd') ||
    n.startsWith('fe80:') ||
    n.startsWith('ff')
  );
}

function toDottedQuad(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** Normalise a hostname that is really an IP literal (plain, bracketed IPv6,
 *  IPv4-mapped, or decimal/hex/octal obfuscated) to a plain IP string, else
 *  null. Handles both whole-number and per-octet obfuscation
 *  (2130706433, 0x7f000001, 0177.0.0.1, 0x7f.0.0.1 …). */
export function ipLiteral(host: string): string | null {
  let h = host.trim();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(h);
  if (mapped) return mapped[1];
  if (net.isIP(h)) return h;
  if (/^0x[0-9a-f]+$/i.test(h)) return toDottedQuad(parseInt(h.slice(2), 16));
  if (/^0[0-7]+$/.test(h) && h.length > 1) return toDottedQuad(parseInt(h.slice(1), 8));
  if (/^[0-9]+$/.test(h)) return toDottedQuad(parseInt(h, 10));

  // Per-octet obfuscation (e.g. 0177.0.0.1, 0x7f.0.0.1).
  const parts = h.split('.');
  if (parts.length === 4) {
    const nums = parts.map((p) => {
      if (/^0x[0-9a-f]+$/i.test(p)) return parseInt(p.slice(2), 16);
      if (/^0[0-7]+$/.test(p) && p.length > 1) return parseInt(p.slice(1), 8);
      if (/^[0-9]+$/.test(p)) return parseInt(p, 10);
      return NaN;
    });
    if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return nums.join('.');
  }
  return null;
}

export function isAllowedHost(hostname: string, allowedDomains: string[]): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (allowedDomains.length === 0) return true;
  return allowedDomains.some((d) => {
    const dd = d.toLowerCase().replace(/\.$/, '');
    return h === dd || h.endsWith(`.${dd}`);
  });
}

/** Validate a URL for outbound navigation. Returns the parsed URL or throws a
 *  tagged Error (UNSUPPORTED_URL_SCHEME / DOMAIN_NOT_ALLOWLISTED /
 *  SSRF_BLOCKED). `lookup` is injectable for tests. */
export async function assertSafeNavigation(
  raw: string,
  allowedDomains: string[] = [],
  lookup: LookupFn = dns.lookup,
): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('UNSUPPORTED_URL_SCHEME');
  if (url.username || url.password) throw new Error('SSRF_BLOCKED');

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost')) throw new Error('SSRF_BLOCKED');
  if (!isAllowedHost(host, allowedDomains)) throw new Error('DOMAIN_NOT_ALLOWLISTED');

  const literal = ipLiteral(host);
  if (literal) {
    if (isPrivateIp(literal)) throw new Error('SSRF_BLOCKED');
    return url;
  }

  let addresses: Awaited<ReturnType<LookupFn>>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('SSRF_BLOCKED');
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) throw new Error('SSRF_BLOCKED');
  return url;
}
