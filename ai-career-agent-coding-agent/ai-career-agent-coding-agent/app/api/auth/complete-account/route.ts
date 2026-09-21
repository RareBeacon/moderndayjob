import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent } from '@/lib/audit';
import { isGoogleLinkedUser, isLinkedInLinkedUser } from '@/lib/auth-oauth';
import { z } from 'zod';

const body = z.object({ phone: z.string().trim().min(4).max(24) });

/**
 * POST /api/auth/complete-account · the step after email verification for
 * Google/LinkedIn sign-ups (owner brief 2026-09-21). The PAGE sets the
 * password first through the user's own signed-in session
 * (auth.updateUser), which keeps that session alive - the admin API must
 * never set the password here, because an admin password change revokes
 * every session and logged the user out mid-flow (2026-09-21 fix). This
 * route stores the phone number and stamps profiles.password_set_at, the
 * signal the completion gate reads. Form signups already provide password
 * + phone at registration and never see this step.
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
    return Response.json({ error: 'INVALID_REQUEST', message: 'Please enter your phone number.' }, { status: 400 });
  }
  const phone = parsed.data.phone.replace(/[\s\-().]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return Response.json({ error: 'INVALID_PHONE', message: 'Please enter a valid phone number with its country code, e.g. +234 801 234 5678.' }, { status: 400 });
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ phone, password_set_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (profileError) {
    void auditEvent({ action: 'ACCOUNT_COMPLETION_FAILED', resource: 'auth', userId: user.id, outcome: 'error', meta: { step: 'phone' } });
    return Response.json({ error: 'PHONE_FAILED', message: 'We could not save your phone number just now. Please try again.' }, { status: 500 });
  }

  void auditEvent({ action: 'ACCOUNT_COMPLETED', resource: 'auth', userId: user.id, outcome: 'allow', meta: { provider: 'social' } });
  return Response.json({ ok: true });
}
