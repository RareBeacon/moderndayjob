import { createHash } from 'node:crypto';

/**
 * GoTrue's /verify endpoint expects `token_hash` = lowercase hex SHA-256 of
 * the raw recovery token carried in the link's `token` query parameter. This
 * mirrors the official client's internal `sha256` helper.
 */
export function recoveryTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
