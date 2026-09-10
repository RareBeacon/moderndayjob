import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWelcomeEmail } from '@/lib/email/resend';
import { auditEvent } from '@/lib/audit';
import { enforceRateLimit, getRedis, requestIp } from '@/lib/rate-limit';
import { DEVICE_COOKIE, hashSignal, issueDeviceId, readDeviceId } from '@/lib/security/device';
import { classifyRegistrationRisk, isRegistrationBlocked } from '@/lib/security/risk';

/**
 * POST /api/auth/signup · create an account that works immediately.
 *
 * Security layers (server-side only):
 *  - strict per-IP rate limit;
 *  - server-issued device cookie + registration-velocity risk score
 *    (hashed IP + device signals; EXTREME velocity is blocked, HIGH is
 *    flagged in the audit trail but allowed so shared devices stay usable);
 *  - admin-API account creation with email_confirm: true (the hosted project
 *    requires confirmation, so signup -> sign-in -> operate is one motion).
 */
export async function POST(req: Request) {
  const ip = requestIp(req);

  const rl = await enforceRateLimit(`auth:signup:${ip}`, 5, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  if (!name) return NextResponse.json({ error: 'Please tell us your name.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Your password needs at least 8 characters.' }, { status: 400 });
  }

  // Device identity + registration velocity (abuse detection). Fails open if
  // Redis is not configured; never blocks a legitimate first signup.
  const deviceId = readDeviceId(req) ?? issueDeviceId();
  let risk: ReturnType<typeof classifyRegistrationRisk> = 'LOW';
  const redis = getRedis();
  if (redis) {
    try {
      const ipKey = `reg:ip:${hashSignal(ip)}`;
      const devKey = `reg:dev:${deviceId}`;
      const [ipCount, devCount] = await Promise.all([redis.incr(ipKey), redis.incr(devKey)]);
      await Promise.all([redis.expire(ipKey, 24 * 3600), redis.expire(devKey, 24 * 3600)]);
      risk = classifyRegistrationRisk({
        signupsFromIp: Number(ipCount),
        signupsFromDevice: Number(devCount),
      });
    } catch {
      risk = 'LOW';
    }
  }

  if (isRegistrationBlocked(risk)) {
    void auditEvent({ action: 'SUSPICIOUS_REGISTRATION', resource: 'auth', meta: { risk } });
    return NextResponse.json(
      { error: 'Too many sign-ups from this device or network. Please try again later.' },
      { status: 429 },
    );
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (error) {
    const already = error.status === 422 || /already (registered|exists)/i.test(error.message);
    if (already) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Sign in instead, or reset your password.' },
        { status: 409 },
      );
    }
    if (error.status === 429 || /rate/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Too many sign-ups just now. Please try again in a minute.' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: 'We could not create your account just now. Please try again.' }, { status: 500 });
  }

  // Best-effort welcome email (Resend). Fire-and-forget: never delays or fails
  // the sign-up response.
  if (data.user?.email) {
    sendWelcomeEmail(data.user.email, name).catch(() => {});
  }
  void auditEvent({
    action: 'USER_SIGNUP',
    resource: 'auth',
    userId: data.user?.id ?? null,
    meta: { email_confirmed: true, risk },
  });

  const res = NextResponse.json({ ok: true, user: { id: data.user?.id ?? null } });
  res.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
