import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';
import { issueEmailVerificationCode, confirmEmailVerificationCode } from '@/lib/auth-oauth';
import { sendWelcomeEmailOnce } from '@/lib/email/welcome';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), email: z.string().email() }),
  z.object({ action: z.literal('confirm'), email: z.string().email(), code: z.string().regex(/^\d{6}$/) }),
]);

type AdminUser = { id: string; email?: string | null; email_confirmed_at?: string | null };

/** Find a user by email through the admin API (paged, bounded). */
async function findUserByEmail(email: string): Promise<AdminUser | null> {
  for (let page = 1; page <= 20; page++) {
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) return null;
    const users = (list?.users ?? []) as AdminUser[];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 500) return null;
  }
  return null;
}

/**
 * POST /api/auth/verify · pre-session email verification for password
 * accounts (created unconfirmed at signup).
 *
 *  { action: 'send', email }            → (re)send the 6-digit code + link
 *  { action: 'confirm', email, code }   → verify, activate the account, then
 *                                         send the welcome email (once).
 *
 * Anti-enumeration: 'send' always answers { ok: true } the same way whether
 * or not the account exists or is already verified. Confirm failures are
 * generic. Both actions are rate-limited per IP; code issuance additionally
 * has a 60s cooldown inside the issuing helper.
 */
export async function POST(req: Request) {
  const ip = requestIp(req);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const key = parsed.data.action === 'send' ? `auth:verify-send:${ip}` : `auth:verify-confirm:${ip}`;
  const limit = parsed.data.action === 'send' ? 5 : 20;
  const rl = await enforceRateLimit(key, limit, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await findUserByEmail(email);

  if (parsed.data.action === 'send') {
    if (!user || user.email_confirmed_at) {
      // Unknown or already active: identical response, no code is sent.
      return NextResponse.json({ ok: true });
    }
    const result = await issueEmailVerificationCode(
      { id: user.id, email: user.email, fullName: null },
      { kind: 'signup' },
    );
    if (result.cooldown) {
      return NextResponse.json({ ok: true, message: 'A code was sent recently. Please wait a minute before requesting another.' });
    }
    if (!result.sent) {
      return NextResponse.json({ ok: true, message: 'We could not send a code right now. Please try again shortly.' });
    }
    return NextResponse.json({ ok: true, message: 'We sent a 6-digit code to your email. It expires in 10 minutes.' });
  }

  // action === 'confirm'
  if (!user) {
    return NextResponse.json({ ok: false, message: 'That code did not work. Check the code or request a new one.' }, { status: 400 });
  }
  if (user.email_confirmed_at) {
    // Idempotent: already active.
    return NextResponse.json({ ok: true });
  }

  const outcome = await confirmEmailVerificationCode({ id: user.id }, parsed.data.code);
  if (outcome !== 'VERIFIED') {
    void auditEvent({ action: 'EMAIL_VERIFY_FAILED', resource: 'auth', userId: user.id, outcome: 'deny', meta: { outcome } });
    const message =
      outcome === 'EXPIRED'
        ? 'That code has expired. Send a new one and try again.'
        : outcome === 'TOO_MANY_ATTEMPTS'
          ? 'Too many attempts. Send a new code and try again.'
          : 'That code did not work. Check the code or request a new one.';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }

  const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: true });
  if (confirmError) {
    return NextResponse.json({ ok: false, message: 'We could not complete verification just now. Please try again.' }, { status: 500 });
  }

  void auditEvent({ action: 'EMAIL_VERIFIED', resource: 'auth', userId: user.id, outcome: 'allow' });
  // Welcome email, once per account (marker-guarded on the profiles row).
  if (user.email) void sendWelcomeEmailOnce(user.id, user.email);

  return NextResponse.json({ ok: true });
}
