import { beforeEach, describe, expect, it } from 'vitest';

/**
 * PII reveal tokens (Phase 2, B-063): bound to one admin, short-lived,
 * tamper-evident, constant-time verified.
 */
import { issueRevealToken, verifyRevealToken, REVEAL_TTL_SECONDS } from '@/lib/security/reveal';

beforeEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = 'unit-test-master-key-0000000000000000';
});

describe('reveal tokens', () => {
  it('round-trips for the issuing admin', () => {
    const { token, expiresIn } = issueRevealToken('admin-1');
    expect(expiresIn).toBe(REVEAL_TTL_SECONDS);
    expect(verifyRevealToken(token, 'admin-1')).toBe(true);
  });

  it('rejects tokens issued for a different admin', () => {
    const { token } = issueRevealToken('admin-1');
    expect(verifyRevealToken(token, 'admin-2')).toBe(false);
  });

  it('expires after the TTL', () => {
    const now = Date.now();
    const { token } = issueRevealToken('admin-1', now);
    expect(verifyRevealToken(token, 'admin-1', now + 1000)).toBe(true);
    expect(verifyRevealToken(token, 'admin-1', now + (REVEAL_TTL_SECONDS + 5) * 1000)).toBe(false);
  });

  it('rejects tampered tokens and garbage', () => {
    const { token } = issueRevealToken('admin-1');
    const tampered = `${token.slice(0, -2)}ff`;
    expect(verifyRevealToken(tampered, 'admin-1')).toBe(false);
    expect(verifyRevealToken('', 'admin-1')).toBe(false);
    expect(verifyRevealToken('not-a-token', 'admin-1')).toBe(false);
    expect(verifyRevealToken('12345.abcdef', 'admin-1')).toBe(false);
  });
});
