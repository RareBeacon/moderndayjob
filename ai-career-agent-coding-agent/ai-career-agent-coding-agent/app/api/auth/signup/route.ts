import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendVerificationEmail } from '@/lib/email/resend';
import { auditEvent } from '@/lib/audit';
import { enforceRateLimit, getRedis, requestIp } from '@/lib/rate-limit';
import { DEVICE_COOKIE, hashSignal, issueDeviceId, readDeviceId } from '@/lib/security/device';
import { classifyRegistrationRisk, isRegistrationBlocked } from '@/lib/security/risk';

function safeShort(value: unknown, max = 180) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
}

function sanitizeSignupAttribution(value: Record<string, unknown> | undefined) {
  const sourceArticle = safeShort(value?.sourceArticle ?? value?.source_article);
  const sourceTool = safeShort(value?.sourceTool ?? value?.source_tool);
  const anonymousId = safeShort(value?.anonymousId, 120);
  const sourceUrl = safeShort(value?.sourceUrl ?? value?.source_url, 500);
  const targetUrl = safeShort(value?.targetUrl ?? value?.target_url, 500);
  const source = safeShort(value?.source, 120);
  return { sourceArticle, sourceTool, anonymousId, sourceUrl, targetUrl, source };
}

async function recordSignupAttribution(input: {
  userId?: string | null;
  attribution: ReturnType<typeof sanitizeSignupAttribution>;
}) {
  const { attribution } = input;
  if (!attribution.sourceArticle && !attribution.sourceTool) return;
  try {
    const { data: project } = await supabaseAdmin.from('seo_projects').select('id').limit(1).maybeSingle();
    await supabaseAdmin.from('seo_conversion_events').insert({
      project_id: project?.id ?? null,
      user_id: input.userId ?? null,
      anonymous_id: attribution.anonymousId,
      event_name: attribution.sourceArticle ? 'signup_created_from_article' : 'signup_created_from_tool',
      article_slug: attribution.sourceArticle,
      source_url: attribution.sourceUrl,
      target_url: attribution.targetUrl,
      tool_id: attribution.sourceTool,
      metadata: { source: attribution.source },
    });
  } catch {
    // Attribution must never block signup.
  }
}

/**
 * POST /api/auth/signup · create an account that must be email-verified.
 *
 * Deliberately minimal: email + password only. Profile details are collected
 * after authentication (onboarding/profile), never at registration.
 *
 * Security layers (server-side only):
 *  - email normalized (trim + lowercase) and format-validated; uniqueness is
 *    enforced by the database (GoTrue) and reported with a friendly 409;
 *  - strict per-IP rate limit;
 *  - server-issued device cookie + registration-velocity risk score
 *    (hashed IP + device signals; EXTREME velocity is blocked, HIGH is
 *    flagged in the audit trail but allowed so shared devices stay usable);
 *  - admin-API account creation with email_confirm: false, then a signup
 *    confirmation link is issued and emailed; the account cannot be used
 *    until the owner clicks the link (mandatory email verification).
 */
export async function POST(req: Request) {
  const ip = requestIp(req);

  const rl = await enforceRateLimit(`auth:signup:${ip}`, 5, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let body: { email?: string; password?: string; attribution?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const attribution = sanitizeSignupAttribution(body.attribution);

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
    email_confirm: false,
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

  // Issue the signup confirmation link and email it. Best-effort: if the email
  // cannot be sent, the user can resend it from the login page, so signup still
  // succeeds — but the account stays locked until it is verified.
  if (data.user?.email) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jobiest.com';
      const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email: data.user.email,
        password,
        options: { redirectTo: `${appUrl}/login` },
      });
      if (!linkError && link?.properties?.action_link) {
        await sendVerificationEmail(data.user.email, link.properties.action_link).catch(() => {});
      }
    } catch {
      // Verification email is best-effort; the login page offers a resend.
    }
  }

  void auditEvent({
    action: 'USER_SIGNUP',
    resource: 'auth',
    userId: data.user?.id ?? null,
    meta: { email_confirmed: false, risk, sourceArticle: attribution.sourceArticle, sourceTool: attribution.sourceTool },
  });
  void recordSignupAttribution({ userId: data.user?.id ?? null, attribution });

  const res = NextResponse.json({ ok: true, verificationRequired: true, user: { id: data.user?.id ?? null } });
  res.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
