import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent } from '@/lib/audit';
import { isGoogleLinkedUser, isLinkedInLinkedUser } from '@/lib/auth-oauth';
import { z } from 'zod';

const body = z.object({
  password: z.string().min(1).max(72),
  phone: z.string().trim().min(4).max(24),
});

/**
 * POST /api/auth/complete-account · the step after email verification for
 * Google/LinkedIn sign-ups (owner brief 2026-09-21): set a password and a
 * phone number so every account, however it was created, ends up with the
 * same three credentials (verified email + password + phone). Form signups
 * already provide password + phone at registration and never see this step.
 *
 * Server-side only decisions; the password policy matches the signup form
 * (8+ characters including a number and a special character).
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser({ allowIncompleteMfa: true });
  } catch {
    return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const rate = await enforceRateLimit(`complete-account:${requestIp(req)}:${user.id}`, 10, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const socialLinked = isGoogleLinkedUser(user) || isLinkedInLinkedUser(user);
  if (!socialLinked) {
    // Form accounts complete at signup; nothing to do here.
    return Response.json({ error: 'NOT_APPLICABLE', message: 'Your account is already complete.' }, { status: 400 });
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_REQUEST', message: 'Please fill in every field correctly.' }, { status: 400 });
  }
  const phone = parsed.data.phone.replace(/[\s\-().]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return Response.json({ error: 'INVALID_PHONE', message: 'Please enter a valid phone number with its country code, e.g. +234 801 234 5678.' }, { status: 400 });
  }
  const password = parsed.data.password;
  if (password.length < 8 || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return Response.json(
      { error: 'WEAK_PASSWORD', message: 'Your password needs at least 8 characters, including a number and a special character.' },
      { status: 400 },
    );
  }

  // 1. Give the social account a password identity (the verified email is
  //    already on the account from the OAuth provider).
  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
  if (passwordError) {
    return Response.json({ error: 'PASSWORD_FAILED', message: 'We could not save your password just now. Please try again.' }, { status: 500 });
  }

  // 2. Store the phone number on the profile.
  const { error: profileError } = await supabaseAdmin.from('profiles').update({ phone, updated_at: new Date().toISOString() }).eq('user_id', user.id);
  if (profileError) {
    void auditEvent({ action: 'ACCOUNT_COMPLETION_PARTIAL', resource: 'auth', userId: user.id, outcome: 'error', meta: { step: 'phone' } });
    return Response.json({ error: 'PHONE_FAILED', message: 'Your password is saved, but we could not save your phone number. Please try again.' }, { status: 500 });
  }

  void auditEvent({ action: 'ACCOUNT_COMPLETED', resource: 'auth', userId: user.id, outcome: 'allow', meta: { provider: 'social' } });
  return Response.json({ ok: true });
}
