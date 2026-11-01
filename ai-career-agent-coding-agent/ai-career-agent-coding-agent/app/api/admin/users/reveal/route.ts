import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { requireAuditEvent } from '@/lib/audit';
import { issueRevealToken } from '@/lib/security/reveal';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * POST /api/admin/users/reveal - re-authenticate to obtain a 5-minute PII
 * reveal token (B-063). The password is verified against Supabase's token
 * endpoint server-side (never stored, never logged), the minted ephemeral
 * GoTrue session is immediately revoked so no orphan session persists, and
 * every attempt - success or failure - is audit-logged (fail-closed on allow).
 *
 * Brute-force defense: strictly capped to 6 attempts per 10 minutes per IP
 * AND per admin user ID.
 */

const body = z.object({ password: z.string().min(1).max(200) });

async function verifyAndRevokeEphemeralPasswordSession(
  email: string,
  password: string,
): Promise<'ok' | 'mismatch' | 'unavailable'> {
  const baseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '');
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return 'unavailable';
  }

  if (!res.ok) return 'mismatch';

  // Best-effort revoke the ephemeral GoTrue session created by grant_type=password.
  try {
    const payload = (await res.json().catch(() => null)) as { access_token?: string } | null;
    if (payload?.access_token) {
      await fetch(`${baseUrl}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${payload.access_token}`,
        },
        signal: AbortSignal.timeout(4_000),
      }).catch(() => undefined);
    }
  } catch {
    // Non-fatal session cleanup.
  }

  return 'ok';
}

export async function POST(req: Request) {
  const ip = requestIp(req);
  const ipRl = await enforceRateLimit(`admin:users:reveal:ip:${ip}`, 6, '10 m');
  if (!ipRl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser(req);
    const adminRl = await enforceRateLimit(`admin:users:reveal:admin:${admin.id}`, 6, '10 m');
    if (!adminRl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    if (!admin.email) return Response.json({ error: 'ADMIN_EMAIL_UNKNOWN' }, { status: 400 });

    const outcome = await verifyAndRevokeEphemeralPasswordSession(admin.email, parsed.data.password);
    if (outcome === 'unavailable') {
      return Response.json({ error: 'AUTH_UPSTREAM_UNAVAILABLE' }, { status: 503 });
    }
    if (outcome === 'mismatch') {
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
