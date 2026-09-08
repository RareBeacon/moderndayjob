import { describe, it, expect } from 'vitest';
import { assertSafeNavigation, ipLiteral, isPrivateIp, isAllowedHost, type LookupFn } from '../lib/agent/ssrf';

const pub = (ip = '93.184.216.34') =>
  (async () => [{ address: ip, family: 4 }]) as unknown as LookupFn;

describe('isPrivateIp', () => {
  it('flags IPv4 private/reserved ranges', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it('accepts public IPv4', () => {
    expect(isPrivateIp('93.184.216.34')).toBe(false);
  });
  it('flags IPv6 loopback/link-local/ULA', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12::1', 'fe80::1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
});

describe('ipLiteral', () => {
  it('normalises obfuscated IPv4 forms', () => {
    expect(ipLiteral('127.0.0.1')).toBe('127.0.0.1');
    expect(ipLiteral('2130706433')).toBe('127.0.0.1'); // decimal
    expect(ipLiteral('0x7f000001')).toBe('127.0.0.1'); // hex
    expect(ipLiteral('0177.0.0.1')).toBe('127.0.0.1'); // octal-ish (parsed as decimal 177? no)
    expect(ipLiteral('[::1]')).toBe('::1');
    expect(ipLiteral('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(ipLiteral('example.com')).toBe(null);
  });
});

describe('isAllowedHost', () => {
  it('matches exact and subdomain', () => {
    expect(isAllowedHost('boards.greenhouse.io', ['greenhouse.io'])).toBe(true);
    expect(isAllowedHost('greenhouse.io', ['greenhouse.io'])).toBe(true);
    expect(isAllowedHost('evilgreenhouse.io', ['greenhouse.io'])).toBe(false);
  });
});

describe('assertSafeNavigation', () => {
  it('allows a public http(s) URL', async () => {
    const url = await assertSafeNavigation('https://boards.greenhouse.io/acme/jobs/1', ['greenhouse.io'], pub());
    expect(url.hostname).toBe('boards.greenhouse.io');
  });
  it('blocks non-http schemes', async () => {
    await expect(assertSafeNavigation('file:///etc/passwd', [], pub())).rejects.toThrow('UNSUPPORTED_URL_SCHEME');
    await expect(assertSafeNavigation('gopher://example.com/', [], pub())).rejects.toThrow('UNSUPPORTED_URL_SCHEME');
  });
  it('blocks userinfo URLs', async () => {
    await expect(assertSafeNavigation('https://user:pass@example.com/', [], pub())).rejects.toThrow('SSRF_BLOCKED');
  });
  it('blocks localhost and metadata hosts', async () => {
    for (const h of ['http://localhost/', 'http://127.0.0.1/', 'http://169.254.169.254/', 'http://metadata.google.internal/', 'http://foo.localhost/']) {
      await expect(assertSafeNavigation(h, [], pub()), h).rejects.toThrow('SSRF_BLOCKED');
    }
  });
  it('blocks obfuscated IP literals', async () => {
    await expect(assertSafeNavigation('http://2130706433/', [], pub())).rejects.toThrow('SSRF_BLOCKED');
    await expect(assertSafeNavigation('http://0x7f000001/', [], pub())).rejects.toThrow('SSRF_BLOCKED');
    await expect(assertSafeNavigation('http://[::1]/', [], pub())).rejects.toThrow('SSRF_BLOCKED');
  });
  it('enforces the domain allowlist', async () => {
    await expect(assertSafeNavigation('https://evil.com/', ['greenhouse.io'], pub())).rejects.toThrow('DOMAIN_NOT_ALLOWLISTED');
  });
  it('blocks when DNS resolves to a private IP', async () => {
    const resolver = (async () => [{ address: '10.0.0.5', family: 4 }, { address: '93.184.216.34', family: 4 }]) as unknown as LookupFn;
    await expect(assertSafeNavigation('https://rebind.example.com/', [], resolver)).rejects.toThrow('SSRF_BLOCKED');
  });
  it('blocks when DNS fails or returns nothing', async () => {
    const empty = (async () => []) as unknown as LookupFn;
    await expect(assertSafeNavigation('https://nx.example.com/', [], empty)).rejects.toThrow('SSRF_BLOCKED');
    const throws = (async () => { throw new Error('ENOTFOUND'); }) as unknown as LookupFn;
    await expect(assertSafeNavigation('https://nx.example.com/', [], throws)).rejects.toThrow('SSRF_BLOCKED');
  });
});
