import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { requireAuditEvent } from '@/lib/audit';
import { issueRevealToken } from '@/lib/security/reveal';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * POST /api/admin/users/reveal - re-authenticate to obtain a 5-minute PII
 * reveal token (B-063). The password is verified against Supabase's token
 * endpoint server-side (never stored, never logged) and is REQUIRED to be
 * correct before any PII is returned elsewhere. Every attempt - success or
 * failure - is audit-logged (fail-closed on success).
 */

const body = z.object({ password: z.string().min(1).max(200) });

async function verifyPassword(email: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''),
        },
        body: JSON.stringify({ email, password }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:users:reveal:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser();
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    if (!admin.email) return Response.json({ error: 'ADMIN_EMAIL_UNKNOWN' }, { status: 400 });

    const ok = await verifyPassword(admin.email, parsed.data.password);
    if (!ok) {
      // Best-effort deny audit; the reveal itself failed, nothing was disclosed.
      void requireAuditEvent({
        action: 'ADMIN_PII_REVEAL',
        resource: 'admin',
        resourceId: admin.id,
        userId: admin.id,
        outcome: 'deny',
        meta: { reason: 'password_mismatch' },
      }).catch(() => undefined);
      return Response.json({ error: 'PASSWORD_MISMATCH' }, { status: 401 });
    }

    // Fail-closed: if this audit row cannot be written, no token is issued.
    await requireAuditEvent({
      action: 'ADMIN_PII_REVEAL',
      resource: 'admin',
      resourceId: admin.id,
      userId: admin.id,
      outcome: 'allow',
      meta: { ttl: 300 },
    });

    const { token, expiresIn } = issueRevealToken(admin.id);
    return Response.json({ revealToken: token, expiresIn });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
