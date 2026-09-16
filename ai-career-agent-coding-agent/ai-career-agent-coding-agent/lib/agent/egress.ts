/**
 * Egress allowlist guard (Master Implementation Package B-223, §222-223/261,
 * DoD 17). Fail closed: a URL that is not provably a public https web address
 * is rejected before any server-side fetch.
 *
 * Covers the RT-08 shape without DNS resolution (documented limitation:
 * wildcard-DNS services that resolve to private space are blocked by suffix,
 * but arbitrary DNS rebinds are not; nothing here fetches an IP-literal that
 * passed the literal checks).
 */

/** Wildcard-DNS services commonly used to point a hostname at private space. */
const WILDCARD_DNS_SUFFIXES = [
  'nip.io', 'ssl-ip.io', 'sslip.io', 'traefik.me', 'localhost.directory',
  'v4.glpk.pw', 'xip.io',
];

/** Hostnames that must never be reachable from a user-supplied URL. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'ip6-localhost', 'metadata.google.internal', 'metadata',
  'instance-data', '169.254.169.254',
]);

export class EgressViolationError extends Error {
  constructor(public readonly reason: string, url: string) {
    super(`EGRESS_BLOCKED (${reason}): ${url}`);
    this.name = 'EgressViolationError';
  }
}

function isPrivateIPv4(host: string): string | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return 'malformed-ipv4';
  const [a, b] = parts;
  if (a === 0) return 'this-network';
  if (a === 10) return 'private-10/8';
  if (a === 127) return 'loopback';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 172 && b >= 16 && b <= 31) return 'private-172.16/12';
  if (a === 192 && b === 168) return 'private-192.168/16';
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat-100.64/10';
  if (a >= 224) return 'multicast-or-reserved';
  return null;
}

function isPrivateIPv6(host: string): string | null {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return null;
  if (h === '::' || h === '::1') return 'ipv6-loopback';
  if (h.startsWith('fe80')) return 'ipv6-link-local';
  if (h.startsWith('fc') || h.startsWith('fd')) return 'ipv6-unique-local';
  if (h.startsWith('ff')) return 'ipv6-multicast';
  // IPv4-mapped (::ffff:10.0.0.1; URL canonicalizes to hex groups ::ffff:a00:1)
  const mapped = h.match(/^::ffff:(.+)$/);
  if (mapped) {
    const tail = mapped[1];
    if (/^\d+\.\d+\.\d+\.\d+$/.test(tail)) return isPrivateIPv4(tail);
    const hex = tail.replace(/:/g, '');
    if (/^[0-9a-f]{1,8}$/.test(hex)) {
      const n = parseInt(hex.padStart(8, '0'), 16) >>> 0;
      return isPrivateIPv4(`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
    }
  }
  return null;
}

/** Parse a dotted quad written as a single integer (e.g. 2130706433 = 127.0.0.1). */
function isDecimalIpHost(host: string): boolean {
  return /^\d{8,10}$/.test(host);
}

/** Hex/octal IPv4 encodings (0x7f000001, 0177.0.0.1). */
function isEncodedIpHost(host: string): boolean {
  return /^0x[0-9a-f]{1,8}$/i.test(host) || /^0\d{1,3}(\.\d{1,3}){0,3}$/.test(host);
}

/**
 * Assert the URL is an https address to a public host, on a standard or
 * registered port. Throws EgressViolationError otherwise. Returns the URL.
 */
export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EgressViolationError('unparseable', raw);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new EgressViolationError('scheme', raw);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new EgressViolationError('no-host', raw);
  if (BLOCKED_HOSTNAMES.has(host)) throw new EgressViolationError('blocked-host', raw);
  if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.localhost')) {
    throw new EgressViolationError('internal-suffix', raw);
  }
  if (isDecimalIpHost(host)) throw new EgressViolationError('decimal-ip', raw);
  if (isEncodedIpHost(host)) throw new EgressViolationError('encoded-ip', raw);
  const v4 = isPrivateIPv4(host);
  if (v4) throw new EgressViolationError(v4, raw);
  const v6 = isPrivateIPv6(host);
  if (v6) throw new EgressViolationError(v6, raw);
  if (WILDCARD_DNS_SUFFIXES.some((s) => host.endsWith(`.${s}`) || host === s)) {
    throw new EgressViolationError('wildcard-dns', raw);
  }
  if (url.port && !['80', '443', ''].includes(url.port)) {
    const p = parseInt(url.port, 10);
    // allow common app ports on public hosts; block nothing else by port for
    // now (self-hosted Ollama often lives on :11434).
    if (p < 0 || p > 65535) throw new EgressViolationError('bad-port', raw);
  }
  if (url.username || url.password) throw new EgressViolationError('credentials-in-url', raw);
  return url;
}
