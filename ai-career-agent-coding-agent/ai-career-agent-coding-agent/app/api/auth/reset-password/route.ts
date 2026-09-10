import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';
import { recoveryTokenHash } from '@/lib/auth/recovery';

const body = z.object({
  token: z.string().min(10).max(2000),
  password: z.string().min(8).max(200),
});

/**
 * POST /api/auth/reset-password · exchange a recovery token for a new password.
 *
 * Verifies the OTP against GoTrue (anon-key REST, the same endpoint the
 * official client uses), then updates the password through the admin API.
 * Every failure path returns a generic message so the response never reveals
 * which step failed or whether an account exists.
 */
export async function POST(req: Request) {
  const rl = await enforceRateLimit(`auth:reset:${requestIp(req)}`, 10, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  const { token, password } = parsed.data;

  let userId: string | null = null;
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'recovery', token_hash: recoveryTokenHash(token) }),
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
