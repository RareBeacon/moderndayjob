import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';
import { requireUser } from '@/lib/auth';

const body = z.object({
  // Link path: the token query parameter from a recovery link (legacy/manual
  // flow). GoTrue recovery links carry the hashed token in `token` and
  // /auth/v1/verify expects that value VERBATIM as token_hash - verified
  // empirically against this project: link token == properties.hashed_token.
  // (The sha256 helper in lib/auth/recovery applies to the 6-digit email OTP
  // code flow, not to link tokens.)
  token: z.string().min(10).max(2000).optional(),
  password: z.string().min(8).max(200),
});

/**
 * POST /api/auth/reset-password · exchange a recovery token or a recovery
 * session for a new password.
 *
 * Two accepted proofs, either of which authorizes the change:
 *  1. `token` - the recovery link token (verified against GoTrue /verify);
 *  2. no token + a valid session cookie - the normal case today: GoTrue's
 *     emailed link lands on /reset-password#access_token=... (session in the
 *     URL fragment, not the query string), the browser client persists it,
 *     and the recovery-authenticated session itself is the proof.
 *
 * MFA-incomplete sessions are allowed here deliberately: password recovery
 * must complete before the second factor. Every failure path returns a
 * generic message so the response never reveals which step failed or whether
 * an account exists. Rate-limited per IP.
 */
export async function POST(req: Request) {
  const rl = await enforceRateLimit(`auth:reset:${requestIp(req)}`, 10, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  const { token, password } = parsed.data;

  let userId: string | null = null;
  if (token) {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'recovery', token_hash: token }),
      });
      if (!res.ok) {
        return NextResponse.json({ error: 'INVALID_OR_EXPIRED_LINK' }, { status: 400 });
      }
      const json = (await res.json()) as { user?: { id?: string } };
      userId = json.user?.id ?? null;
    } catch {
      return NextResponse.json({ error: 'RESET_UNAVAILABLE' }, { status: 500 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'INVALID_OR_EXPIRED_LINK' }, { status: 400 });
    }
  } else {
    // Session path: the caller arrived via the recovery link and holds the
    // recovery session in cookies. requireUser also rejects SUSPENDED/
    // TERMINATED accounts.
    const user = await requireUser({ allowIncompleteMfa: true, req }).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'NO_RESET_SESSION' }, { status: 401 });
    }
    userId = user.id;
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (updateError) {
    return NextResponse.json({ error: 'RESET_UNAVAILABLE' }, { status: 500 });
  }

  void auditEvent({
    action: 'PASSWORD_RESET_COMPLETED',
    resource: 'auth',
    userId,
    meta: { ok: true },
  });

  return NextResponse.json({ ok: true });
}
