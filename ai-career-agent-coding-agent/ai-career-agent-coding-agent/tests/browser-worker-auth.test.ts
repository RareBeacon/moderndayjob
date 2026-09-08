import { describe, expect, it } from 'vitest';
import { isAuthorizedHeader } from '../workers/browser/auth';

/**
 * Browser-worker /submit authorization (Phase 9). The isolated worker is the
 * one place a real browser runs, so its single non-health route must be gated
 * by a shared secret that fails closed. These tests pin the exact contract:
 * Bearer prefix, timing-safe exact match, and deny-everything when the secret
 * is not configured.
 */

describe('isAuthorizedHeader (browser worker /submit gate)', () => {
  it('fails closed when no secret is configured', () => {
    expect(isAuthorizedHeader(undefined, undefined)).toBe(false);
    expect(isAuthorizedHeader('Bearer anything', undefined)).toBe(false);
    expect(isAuthorizedHeader('Bearer ', '')).toBe(false);
  });

  it('rejects a missing header even when a secret is set', () => {
    expect(isAuthorizedHeader(undefined, 's3cret')).toBe(false);
  });

  it('accepts the exact Bearer secret', () => {
    expect(isAuthorizedHeader('Bearer s3cret', 's3cret')).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(isAuthorizedHeader('Bearer nope', 's3cret')).toBe(false);
  });

  it('rejects a bare secret without the Bearer prefix', () => {
    expect(isAuthorizedHeader('s3cret', 's3cret')).toBe(false);
  });

  it('rejects case and whitespace mismatches (exact compare)', () => {
    expect(isAuthorizedHeader('bearer s3cret', 's3cret')).toBe(false);
    expect(isAuthorizedHeader('Bearer s3cret ', 's3cret')).toBe(false);
    expect(isAuthorizedHeader(' Bearer s3cret', 's3cret')).toBe(false);
  });

  it('handles unicode secrets byte-exactly', () => {
    const secret = 's3crét-🔐-key';
    expect(isAuthorizedHeader(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedHeader(`Bearer ${secret}x`, secret)).toBe(false);
  });
});
