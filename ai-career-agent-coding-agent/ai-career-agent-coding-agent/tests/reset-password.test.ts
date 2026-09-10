import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { recoveryTokenHash } from '@/lib/auth/recovery';

describe('recoveryTokenHash (GoTrue token_hash)', () => {
  it('returns lowercase hex SHA-256 of the token', () => {
    const token = 'recovery-token-abc';
    const expected = createHash('sha256').update(token).digest('hex');
    expect(recoveryTokenHash(token)).toBe(expected);
    expect(recoveryTokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic and distinct per token', () => {
    expect(recoveryTokenHash('a')).not.toBe(recoveryTokenHash('b'));
    expect(recoveryTokenHash('a')).toBe(recoveryTokenHash('a'));
  });
});
