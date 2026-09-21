import crypto from 'node:crypto';
import { env } from './env';
import { supabaseAdmin } from './supabase';
import { sendEmailVerificationCode, sendSignupVerificationEmail } from './email/resend';

/**
 * Google sign-in email verification gate.
 *
 * Requirement (2026-09-16): accounts created via "Continue with Google" must
 * verify their email address with a 6-digit code before using the product.
 * Password accounts keep the existing instant-access policy; the gate is
 * keyed on the session's google provider claim, never on a client input.
 *
 * Codes are 6 digits from crypto randomness, HMAC-SHA256 hashed at rest with
 * the encryption master key (never stored in clear), expire after 10
 * minutes, allow at most 8 wrong attempts, and are single-use. The table is
 * service-role only (RLS on, no policies).
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 8;

export type SessionUser = {
  id: string;
  email?: string | null;
  app_metadata?: { providers?: string[]; [key: string]: unknown } | null;
};

/** True when the authenticated session was created via the google provider. */
export function isGoogleLinkedUser(user: SessionUser): boolean {
  return (user.app_metadata?.providers ?? []).includes('google');
}

/** True when the authenticated session was created via LinkedIn's OpenID
 *  Connect provider (linkedin_oidc; 'linkedin' is the legacy name). */
export function isLinkedInLinkedUser(user: SessionUser): boolean {
  const providers = user.app_metadata?.providers ?? [];
  return providers.includes('linkedin_oidc') || providers.includes('linkedin');
}

/** 6-digit numeric code, unbiased crypto randomness, zero padded. */
export function generateVerificationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Domain-separated HMAC so this key is never reused for anything else. */
function hashCode(code: string): string {
  return crypto
    .createHmac('sha256', env.ENCRYPTION_MASTER_KEY)
    .update(`emailcode:${code}`)
    .digest('hex');
}

export type IssueResult = { sent: boolean; cooldown: boolean; error?: string };

/**
 * Issue (or throttle) a verification code. `kind` selects the delivery copy:
 * 'google' (signed-in Google gate) or 'signup' (password account activation,
 * where the emailed link carries the code for one-click verification).
 */
export async function issueEmailVerificationCode(
  user: { id: string; email?: string | null; fullName?: string | null },
  opts: { kind?: 'google' | 'signup' } = {},
): Promise<IssueResult> {
  // Cooldown: an unconsumed code issued seconds ago means do not spam.
  const { data: recent } = await supabaseAdmin
    .from('email_verification_codes')
    .select('id, created_at')
    .eq('user_id', user.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    recent &&
    Date.now() - new Date(recent.created_at as unknown as string).getTime() < RESEND_COOLDOWN_MS
  ) {
    return { sent: false, cooldown: true };
  }

  const code = generateVerificationCode();
  const { error } = await supabaseAdmin.from('email_verification_codes').insert({
    user_id: user.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) return { sent: false, cooldown: false, error: 'CODE_STORE_FAILED' };

  const mail =
    opts.kind === 'signup'
      ? await sendSignupVerificationEmail(
          user.email ?? '',
          code,
          `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://jobiest.com'}/verify-email?email=${encodeURIComponent(user.email ?? '')}&code=${code}`,
          user.fullName ?? undefined,
        )
      : await sendEmailVerificationCode(user.email ?? '', code, user.fullName ?? undefined);
  if (!mail.ok) return { sent: false, cooldown: false, error: mail.error ?? 'EMAIL_FAILED' };
  return { sent: true, cooldown: false };
}

export type ConfirmOutcome = 'VERIFIED' | 'NOT_FOUND' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'INVALID' | 'STORE_FAILED';

/** Check a submitted code against the newest unconsumed code for the user. */
export async function confirmEmailVerificationCode(
  user: { id: string },
  submitted: string,
): Promise<ConfirmOutcome> {
  const { data: row } = await supabaseAdmin
    .from('email_verification_codes')
    .select('id, code_hash, expires_at, attempts')
    .eq('user_id', user.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return 'NOT_FOUND';

  const record = row as { id: string; code_hash: string; expires_at: string; attempts: number };
  if (new Date(record.expires_at).getTime() < Date.now()) return 'EXPIRED';
  if (record.attempts >= MAX_ATTEMPTS) return 'TOO_MANY_ATTEMPTS';

  const expected = Buffer.from(record.code_hash, 'hex');
  const given = Buffer.from(hashCode(submitted), 'hex');
  const matches =
    expected.length === given.length && crypto.timingSafeEqual(expected, given);

  if (!matches) {
    await supabaseAdmin
      .from('email_verification_codes')
      .update({ attempts: record.attempts + 1 })
      .eq('id', record.id);
    return 'INVALID';
  }

  await supabaseAdmin
    .from('email_verification_codes')
    .update({ consumed_at: new Date().toISOString(), attempts: record.attempts + 1 })
    .eq('id', record.id);
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ email_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) return 'STORE_FAILED';
  return 'VERIFIED';
}

/** phili•••@gmail.com style display for the verify page. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'your email';
  const head = local.slice(0, 3);
  return `${head}${local.length > 3 ? '...' : ''}@${domain}`;
}
