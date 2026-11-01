import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { countUnusedRecoveryCodes, issueRecoveryCodes, purgeRecoveryCodes } from '@/lib/security/mfa-recovery';
import { getAdminContext } from '@/lib/admin';
import { auditEvent } from '@/lib/audit';

/**
 * GET / POST / DELETE /api/auth/mfa/recovery-codes
 *
 * - GET: returns unused backup recovery code count + whether MFA is mandatory
 *        for this user (Owner / admin accounts).
 * - POST: generates 8 fresh single-use backup codes (hashed in DB, plaintext
 *         returned ONCE in response). Requires fully authenticated session
 *         (completed MFA when enrolled).
 * - DELETE: purges recovery codes when a non-Owner user disables MFA.
 */

export async function GET(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`mfa:recovery:get:${requestIp(req)}:${user.id}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const [unusedCount, adminCtx] = await Promise.all([
    countUnusedRecoveryCodes(user.id),
    getAdminContext(user.id, user.email ?? null),
  ]);

  return Response.json({
    unusedCount,
    mandatoryMfa: Boolean(adminCtx?.requireMfa || adminCtx?.isOwner),
    isOwner: Boolean(adminCtx?.isOwner),
  });
}

export async function POST(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`mfa:recovery:issue:${requestIp(req)}:${user.id}`, 6, '10 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const codes = await issueRecoveryCodes(user.id);
    void auditEvent({
      action: 'MFA_RECOVERY_CODES_ISSUED',
      resource: 'mfa_recovery_codes',
      resourceId: user.id,
      userId: user.id,
      outcome: 'allow',
      meta: { count: codes.length },
    });
    return Response.json({ ok: true, codes, unusedCount: codes.length });
  } catch {
    return Response.json({ error: 'ISSUE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`mfa:recovery:purge:${requestIp(req)}:${user.id}`, 10, '10 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const adminCtx = await getAdminContext(user.id, user.email ?? null);
  if (adminCtx?.isOwner || adminCtx?.requireMfa) {
    return Response.json(
      { error: 'MFA_MANDATORY_FOR_ADMIN', message: 'Two-factor authentication is mandatory for administrative accounts.' },
      { status: 403 },
    );
  }

  await purgeRecoveryCodes(user.id);
  return Response.json({ ok: true });
}
