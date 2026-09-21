import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent } from '@/lib/audit';
import { sendWelcomeEmailOnce } from '@/lib/email/welcome';
import {
  confirmEmailVerificationCode,
  isLinkedInLinkedUser,
  issueEmailVerificationCode,
  maskEmail,
} from '@/lib/auth-oauth';
import { z } from 'zod';

/**
 * LinkedIn sign-in verification state machine (mirrors the Google one).
 *
 * GET  : called right after the OAuth callback. Reports whether this
 *        linkedin session still needs email verification; issues + emails a
 *        code automatically when none is active (the callback page then
 *        routes the user to /verify-email).
 * POST : { action: 'send' } resend (rate limited), or
 *        { action: 'confirm', code } verify a 6-digit code.
 *
 * The gate only ever applies to linkedin-linked sessions; password accounts
 * are never touched here. All decisions are server-side from the session.
 */

const postBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('confirm'), code: z.string().regex(/^\d{6}$/) }),
]);

async function verificationState(userId: string): Promise<{ verified: boolean; fullName: string | null; phone: string | null }> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('email_verified_at, full_name, phone')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as { email_verified_at: string | null; full_name: string | null; phone: string | null } | null;
  return { verified: Boolean(row?.email_verified_at), fullName: row?.full_name ?? null, phone: row?.phone ?? null };
}

/** Owner brief 2026-09-21: after verifying, google/linkedin accounts still
 *  need a password + phone number (set at /complete-account) unless they
 *  already have them. */
function needsAccountCompletion(user: { app_metadata?: { providers?: string[]; [key: string]: unknown } | null }, phone: string | null): boolean {
  const hasPassword = (user.app_metadata?.providers ?? []).includes('email');
  return !hasPassword || !phone;
}

export async function GET() {
  let user;
  try {
    user = await requireUser({ allowIncompleteMfa: true });
  } catch {
    return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  if (!isLinkedInLinkedUser(user)) {
    return Response.json({ requiresVerification: false });
  }

  const { verified, fullName } = await verificationState(user.id);
  if (verified) {
    return Response.json({ requiresVerification: false });
  }

  // Needs verification: make sure a code is on its way (no-op inside the
  // 60s cooldown window so the callback page cannot spam the inbox).
  const issued = await issueEmailVerificationCode({
    id: user.id,
    email: user.email,
    fullName,
  });

  return Response.json({
    requiresVerification: true,
    email: maskEmail(user.email ?? ''),
    codeSent: issued.sent,
    cooldown: issued.cooldown,
    emailError: issued.error ?? null,
  });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser({ allowIncompleteMfa: true });
  } catch {
    return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  if (!isLinkedInLinkedUser(user)) {
    return Response.json({ error: 'NOT_APPLICABLE', message: 'Only LinkedIn accounts need this step.' }, { status: 400 });
  }

  const rate = await enforceRateLimit(`linkedin-verify:${requestIp(req)}:${user.id}`, 12, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = postBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_REQUEST', message: 'Enter the 6-digit code from your email.' }, { status: 400 });
  }

  if (parsed.data.action === 'send') {
    const { verified, fullName } = await verificationState(user.id);
    if (verified) return Response.json({ ok: true, alreadyVerified: true });
    const issued = await issueEmailVerificationCode({ id: user.id, email: user.email, fullName });
    if (issued.cooldown) {
      return Response.json({ ok: true, cooldown: true, message: 'A code was just sent. Check your inbox (and spam folder).' });
    }
    if (!issued.sent) {
      return Response.json({ error: 'EMAIL_FAILED', message: 'We could not send the code right now. Try again in a minute.' }, { status: 503 });
    }
    void auditEvent({ action: 'LINKEDIN_VERIFY_CODE_SENT', resource: 'auth', userId: user.id, outcome: 'allow' });
    return Response.json({ ok: true, cooldown: false });
  }

  // action === 'confirm'
  const outcome = await confirmEmailVerificationCode(user, parsed.data.code);
  if (outcome === 'VERIFIED') {
    void auditEvent({ action: 'LINKEDIN_VERIFY_PASSED', resource: 'auth', userId: user.id, outcome: 'allow' });
    // First-time linkedin sign-ups get the welcome email exactly once; the
    // marker makes replays and refreshes harmless.
    void sendWelcomeEmailOnce(user.id, user.email);
    const { phone } = await verificationState(user.id);
    return Response.json({ ok: true, needsAccountCompletion: needsAccountCompletion(user, phone) });
  }
  void auditEvent({ action: 'LINKEDIN_VERIFY_FAILED', resource: 'auth', userId: user.id, outcome: 'deny', meta: { reason: outcome } });

  const messages: Record<string, string> = {
    NOT_FOUND: 'No active code. Send a new one and try again.',
    EXPIRED: 'That code expired. Send a new one and try again.',
    TOO_MANY_ATTEMPTS: 'Too many wrong codes. Send a new one and try again.',
    INVALID: 'That code is not right. Check it and try again.',
    STORE_FAILED: 'We could not save your verification. Try again in a moment.',
  };
  return Response.json(
    { error: outcome, message: messages[outcome] ?? 'Verification failed. Try again.' },
    { status: outcome === 'INVALID' ? 400 : 422 },
  );
}
