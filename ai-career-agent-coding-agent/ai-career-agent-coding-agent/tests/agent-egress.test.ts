import { describe, expect, it } from 'vitest';
import { assertPublicHttpsUrl, EgressViolationError } from '../lib/agent/egress';

/**
 * Egress allowlist (B-223): every URL a user can cause the server to fetch
 * (AI provider base_url) must be a public https address. Fail closed.
 */

const ALLOWED = [
  'https://api.openai.com/v1',
  'https://api.groq.com/openai/v1',
  'https://my-llm.example.com:8080/v1',
  'http://my-llm.example.com/v1',
  'https://api.anthropic.com',
  'https://sub.domain.deep.io/path?x=1',
];

const BLOCKED: Array<[string, string | null]> = [
  ['http://127.0.0.1:11434/v1', 'loopback'],
  ['https://localhost:3000', 'blocked-host'],
  ['https://metadata.google.internal/computeMetadata/v1', 'blocked-host'],
  ['http://169.254.169.254/latest/meta-data/', 'blocked-host'],
  ['http://10.1.2.3/v1', 'private-10/8'],
  ['http://172.16.0.1/v1', 'private-172.16/12'],
  ['http://192.168.1.1/v1', 'private-192.168/16'],
  ['http://0.0.0.0/', 'this-network'],
  ['http://100.64.0.1/', 'cgnat-100.64/10'],
  ['http://[::1]:8080/', 'ipv6-loopback'],
  ['http://[fe80::1]/', 'ipv6-link-local'],
  ['http://[fd00::1]/', 'ipv6-unique-local'],
  ['http://[::ffff:127.0.0.1]/', 'loopback'],
  ['http://2130706433/', 'decimal-ip'],           // 127.0.0.1 as an integer
  ['http://0x7f000001/', 'encoded-ip'],            // 127.0.0.1 in hex
  ['http://0177.0.0.1/', 'encoded-ip'],            // 127.0.0.1 in octal
  ['https://evil.com.3.3.3.3.nip.io/v1', 'wildcard-dns'],
  ['https://3.3.3.3.sslip.io/v1', 'wildcard-dns'],
  ['https://api.internal/v1', 'internal-suffix'],
  ['https://db.local/v1', 'internal-suffix'],
  ['file:///etc/passwd', 'scheme'],
  ['https://user:pass@api.example.com/v1', 'credentials-in-url'],
  ['not a url', 'unparseable'],
  ['', 'unparseable'],
  ['https://api.evil.com/v1?next=http://169.254.169.254/', null], // query payload is not the target
];

describe('assertPublicHttpsUrl (B-223)', () => {
  it.each(ALLOWED)('allows public address %s', (url) => {
    expect(() => assertPublicHttpsUrl(url)).not.toThrow();
  });

  it.each(BLOCKED.filter(([, reason]) => reason !== null).map(([url]) => url))(
    'blocks %s',
    (url) => {
      expect(() => assertPublicHttpsUrl(url)).toThrow(EgressViolationError);
    },
  );

  it('reports a structured reason, never the full private URL beyond the message', () => {
    try {
      assertPublicHttpsUrl('http://10.0.0.5:9000/v1');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EgressViolationError);
      expect((err as EgressViolationError).reason).toBe('private-10/8');
      expect((err as EgressViolationError).message).toContain('EGRESS_BLOCKED');
    }
  });

  it('a redirect-style payload inside the query string is not itself blocked (the target host decides)', () => {
    const url = assertPublicHttpsUrl('https://api.evil.com/v1?next=http://169.254.169.254/');
    expect(url.hostname).toBe('api.evil.com');
  });
});
