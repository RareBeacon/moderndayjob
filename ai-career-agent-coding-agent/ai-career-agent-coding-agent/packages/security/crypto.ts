import crypto from 'node:crypto';
import { env } from '../../lib/env';

let cachedKey: Buffer | null = null;

/** Derives the AES-256 key lazily so importing this module never requires
 *  runtime secrets. Build-time imports (Next.js page-data collection in
 *  environments without env vars, e.g. Vercel preview builds) succeed, and
 *  the first real encrypt/decrypt derives the key or fails loudly. */
function getKey(): Buffer {
  if (!cachedKey) {
    cachedKey = crypto.createHash('sha256').update(env.ENCRYPTION_MASTER_KEY).digest();
  }
  return cachedKey;
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', getKey(), iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (typeof payload !== 'string') {
    throw new Error('INVALID_CIPHERTEXT');
  }
  const parts = payload.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('INVALID_CIPHERTEXT');
  }
  const [ivS, tagS, dataS] = parts;
  const iv = Buffer.from(ivS, 'base64');
  const tag = Buffer.from(tagS, 'base64');
  const data = Buffer.from(dataS, 'base64');
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('INVALID_CIPHERTEXT');
  }
  const d = crypto.createDecipheriv('aes-256-gcm', getKey(), iv, { authTagLength: 16 });
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
