import { cookies } from 'next/headers';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { verifyAndConsumeRecoveryCode, countUnusedRecoveryCodes } from '@/lib/security/mfa-recovery';
import { APP_SESSION_COOKIE, appSessionCookieOptions, createAppSession, markAppSessionRecoveryVerified } from '@/lib/session';
import { auditEvent } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase';

const bodySchema = z.object({
  code: z.string().trim().min(8).max(32),
});

/**
 * POST /api/auth/mfa/verify-recovery
 *
 * Verifies a single-use backup recovery code during the login MFA challenge
 * step (aal1 session with enrolled TOTP factor). Strict brute-force rate limit
 * applies per IP + user. On success:
 *   1. Consumes the recovery code atomically (used_at = now(), single-use).
 *   2. Marks ONLY the bound server app_sessions row with mfa_recovery_verified_at.
 *   3. Logs MFA_RECOVERY_CODE_USED to audit_logs + security_events.
 */
export async function POST(req: Request) {
  const ip = requestIp(req);
  const user = await requireUser({ req, allowIncompleteMfa: true, allowMissingAppSession: true }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`mfa:recovery:verify:${ip}:${user.id}`, 5, '10 m');
  if (!rl.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED', message: 'Too many recovery attempts. Please wait 15 minutes before trying again.' },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_CODE', message: 'Enter a valid backup recovery code.' }, { status: 400 });
  }

  const ok = await verifyAndConsumeRecoveryCode(user.id, parsed.data.code);
  if (!ok) {
    void auditEvent({
      action: 'MFA_RECOVERY_CODE_FAILED',
      resource: 'mfa_recovery_codes',
      resourceId: user.id,
      userId: user.id,
      outcome: 'deny',
    });
    return Response.json(
      { error: 'INVALID_RECOVERY_CODE', message: 'That backup code is invalid or has already been used.' },
      { status: 401 },
    );
  }

  const cookieStore = await cookies();
  let appToken = cookieStore.get(APP_SESSION_COOKIE)?.value ?? '';
  if (!appToken) {
    const created = await createAppSession({
      userId: user.id,
      ip,
      userAgent: req.headers.get('user-agent'),
    });
    appToken = created.token;
    cookieStore.set(APP_SESSION_COOKIE, appToken, appSessionCookieOptions());
  }

  const elevated = await markAppSessionRecoveryVerified({ token: appToken, userId: user.id });
  if (elevated.updatedSignedToken) {
    cookieStore.set(APP_SESSION_COOKIE, elevated.updatedSignedToken, appSessionCookieOptions());
  }

  const remaining = await countUnusedRecoveryCodes(user.id);

  void auditEvent({
    action: 'MFA_RECOVERY_CODE_USED',
    resource: 'mfa_recovery_codes',
    resourceId: user.id,
    userId: user.id,
    outcome: 'allow',
    meta: { remainingUnusedCodes: remaining },
  });

  try {
    await supabaseAdmin.from('security_events').insert({
      user_id: user.id,
      event_type: 'MFA_RECOVERY_CODE_USED',
      severity: 'WARN',
      details: { remainingUnusedCodes: remaining },
    });
  } catch {
    /* best-effort */
  }

  return Response.json({ ok: true, remainingUnusedCodes: remaining });
}
