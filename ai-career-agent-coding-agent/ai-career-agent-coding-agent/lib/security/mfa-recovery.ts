import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_COUNT = 8;

function recoveryHmacSecret(): string {
  const secret =
    process.env.ENCRYPTION_MASTER_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    (process.env.NODE_ENV !== 'production' ? 'jobiest-dev-mfa-recovery-secret' : '');
  if (!secret) throw new Error('MFA_RECOVERY_SECRET_MISSING');
  return secret;
}

export function normalizeRecoveryCode(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function hashRecoveryCode(userId: string, rawCode: string): string {
  const normalized = normalizeRecoveryCode(rawCode);
  return createHmac('sha256', recoveryHmacSecret())
    .update(`jobiest-mfa-recovery-v1:${userId}:${normalized}`)
    .digest('hex');
}

export function generateSingleCode(): string {
  const bytes = randomBytes(12);
  let chars = '';
  for (let i = 0; i < 12; i += 1) {
    chars += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function generatePlainRecoveryCodes(count = CODE_COUNT): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  while (codes.length < count) {
    const candidate = generateSingleCode();
    if (!seen.has(candidate)) {
      seen.add(candidate);
      codes.push(candidate);
    }
  }
  return codes;
}

/**
 * Generates 8 fresh single-use MFA backup recovery codes, replaces any prior
 * codes for `userId` with salted HMAC-SHA256 hashes, and returns the plaintext
 * codes ONCE so the user can save them. Plaintext is never persisted.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes: string[] = [];
  const seen = new Set<string>();
  while (codes.length < CODE_COUNT) {
    const candidate = generateSingleCode();
    if (!seen.has(candidate)) {
      seen.add(candidate);
      codes.push(candidate);
    }
  }

  await supabaseAdmin.from('mfa_recovery_codes').delete().eq('user_id', userId);

  const rows = codes.map((code) => ({
    user_id: userId,
    code_hash: hashRecoveryCode(userId, code),
  }));
  const { error } = await supabaseAdmin.from('mfa_recovery_codes').insert(rows);
  if (error) throw error;

  return codes;
}

export async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('mfa_recovery_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null);
  if (error) return 0;
  return count ?? 0;
}

export async function purgeRecoveryCodes(userId: string): Promise<void> {
  await supabaseAdmin.from('mfa_recovery_codes').delete().eq('user_id', userId);
}

/**
 * Verifies and atomically consumes a single-use backup recovery code.
 * Uses constant-time digest comparison across unused hashes for `userId`.
 */
export async function verifyAndConsumeRecoveryCode(userId: string, rawCode: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(rawCode);
  if (normalized.length < 8 || normalized.length > 20) return false;

  const candidateHex = hashRecoveryCode(userId, normalized);
  const candidateBuf = Buffer.from(candidateHex, 'hex');

  const { data: rows, error } = await supabaseAdmin
    .from('mfa_recovery_codes')
    .select('id, code_hash')
    .eq('user_id', userId)
    .is('used_at', null);
  if (error || !rows || rows.length === 0) return false;

  let matchedId: string | null = null;
  for (const row of rows as Array<{ id: string; code_hash: string }>) {
    try {
      const storedBuf = Buffer.from(String(row.code_hash ?? ''), 'hex');
      if (storedBuf.length === candidateBuf.length && timingSafeEqual(storedBuf, candidateBuf)) {
        matchedId = row.id;
      }
    } catch {
      /* ignore malformed hash */
    }
  }
  if (!matchedId) return false;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('mfa_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', matchedId)
    .eq('user_id', userId)
    .is('used_at', null)
    .select('id')
    .maybeSingle();

  return !updateErr && Boolean(updated?.id);
}
