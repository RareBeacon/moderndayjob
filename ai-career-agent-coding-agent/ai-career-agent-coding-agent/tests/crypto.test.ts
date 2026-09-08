import { afterEach, describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret } from '@packages/security/crypto';

/**
 * Credential encryption at rest (Phase 9). AI provider keys are stored
 * AES-256-GCM encrypted with a key derived from ENCRYPTION_MASTER_KEY. These
 * tests pin: round-trip integrity, fresh IV per encryption (non-deterministic
 * ciphertext), tamper detection via the GCM auth tag, malformed-payload
 * rejection, and key isolation (a different master key cannot decrypt).
 */

describe('encryptSecret / decryptSecret (AES-256-GCM)', () => {
  it('round-trips arbitrary secrets byte-for-byte', () => {
    for (const s of ['sk-openrouter-abcdef1234567890', 'pässwörd 🔐 中文', 'x'.repeat(500)]) {
      expect(decryptSecret(encryptSecret(s))).toBe(s);
    }
  });

  it('uses a fresh random IV per encryption — ciphertext never repeats', () => {
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a).not.toBe(b);
  });

  it('emits a well-formed envelope: iv(12B).tag(16B).ciphertext(nB)', () => {
    const plaintext = 'secret-value';
    const [iv, tag, data] = encryptSecret(plaintext).split('.');
    expect([iv, tag, data].every((p) => p.length > 0)).toBe(true);
    expect(Buffer.from(iv, 'base64').length).toBe(12); // GCM nonce
    expect(Buffer.from(tag, 'base64').length).toBe(16); // GCM auth tag
    expect(Buffer.from(data, 'base64').length).toBe(Buffer.byteLength(plaintext));
  });

  it('rejects tampering in the IV, auth tag, or ciphertext', () => {
    const [iv, tag, data] = encryptSecret('secret').split('.');
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, 'base64');
      buf[0] ^= 0xff;
      return buf.toString('base64');
    };
    expect(() => decryptSecret(`${flip(iv)}.${tag}.${data}`)).toThrow();
    expect(() => decryptSecret(`${iv}.${flip(tag)}.${data}`)).toThrow();
    expect(() => decryptSecret(`${iv}.${tag}.${flip(data)}`)).toThrow();
  });

  it('rejects malformed payloads instead of returning garbage', () => {
    expect(() => decryptSecret('')).toThrow();
    expect(() => decryptSecret('single-part')).toThrow();
    expect(() => decryptSecret('iv.tag')).toThrow(); // missing ciphertext part
  });

  it('cannot decrypt with a different master key', async () => {
    const payload = encryptSecret('top-secret-value');
    vi.resetModules();
    vi.stubEnv('ENCRYPTION_MASTER_KEY', 'a-completely-different-master-key-xyz');
    const fresh = await import('@packages/security/crypto');
    expect(() => fresh.decryptSecret(payload)).toThrow();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
