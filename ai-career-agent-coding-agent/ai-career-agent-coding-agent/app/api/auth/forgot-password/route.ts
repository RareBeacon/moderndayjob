import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPasswordResetEmail } from '@/lib/email/resend';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';

const body = z.object({ email: z.string().email() });

/**
 * POST /api/auth/forgot-password · issue a recovery link over email.
 *
 * Never reveals whether an account exists: every path returns the same
 * `{ ok: true }` shape. Rate-limited per IP. The recovery link is generated
 * server-side through the Supabase admin API and points at /reset-password.
 */
export async function POST(req: Request) {
  const rl = await enforceRateLimit(`auth:forgot:${requestIp(req)}`, 5, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jobiest.com';

  let sent = false;
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/reset-password` },
  });
  if (!error && data?.properties?.action_link) {
    sent = true;
    // Best-effort email; failures must not leak or block the response.
    sendPasswordResetEmail(email, data.properties.action_link).catch(() => {});
  }

  // Audit without PII: no email address is stored in meta.
  void auditEvent({
    action: 'PASSWORD_RESET_REQUEST',
    resource: 'auth',
    meta: { sent },
  });

  return NextResponse.json({ ok: true });
}
