import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAppSession, appSessionCookieOptions, APP_SESSION_COOKIE } from '@/lib/session';
import { ensureProfile } from '@/lib/auth/profile';
import { resolveAuthDestination, markProfileVerified } from '@/lib/auth/routing';
import { issueEmailVerificationCode } from '@/lib/auth-oauth';
import { sendWelcomeEmailOnce } from '@/lib/email/welcome';
import { ensurePeriodGrants } from '@/lib/credits';
import { env } from '@/lib/env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

function safeRedirectTarget(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (next.includes('://')) return null;
  return next;
}

function errorRedirect(origin: string, code: string): NextResponse {
  const url = new URL('/login', origin);
  url.searchParams.set('error', code);
  return NextResponse.redirect(url);
}

/**
 * Unified OAuth callback - the ONLY place exchangeCodeForSession happens.
 * Mints `jobiest_app_session` BEFORE routing to /verify-email, /complete-account,
 * /mfa-verify, or /dashboard so middleware never bounces social/MFA logins.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next');
  const safeNext = safeRedirectTarget(nextParam);
  const error = url.searchParams.get('error');
  const errorCode = url.searchParams.get('error_code');

  if (error) {
    if (error === 'access_denied') return errorRedirect(origin, 'oauth_cancelled');
    return errorRedirect(origin, 'oauth_failed');
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const msg = exchangeError.message || '';
      const alreadyUsed = /already been used|flow_state|bad_oauth_state/i.test(msg) || errorCode === 'flow_state_already_used';
      if (alreadyUsed) {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          console.warn('[auth/callback] flow_state_already_used without session', { errorCode, msg: msg.slice(0, 100) });
          return errorRedirect(origin, 'session_expired');
        }
      } else {
        console.warn('[auth/callback] exchange failed', { msg: msg.slice(0, 200), errorCode });
        return errorRedirect(origin, 'oauth_failed');
      }
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[auth/callback] no user after exchange', { hasCode: Boolean(code), errorCode });
    return errorRedirect(origin, code ? 'session_expired' : 'oauth_failed');
  }

  await ensureProfile(user).catch((e) => console.warn('[auth/callback] ensureProfile failed', (e as Error).message.slice(0, 100)));
  await ensurePeriodGrants(user.id).catch(() => {});

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;
  const ua = request.headers.get('user-agent');
  let appToken: string | null = null;
  try {
    const created = await createAppSession({ userId: user.id, ip, userAgent: ua });
    appToken = created.token;
  } catch (e) {
    console.warn('[auth/callback] createAppSession failed', (e as Error).message.slice(0, 100));
  }

  const buildRedirect = (targetUrl: URL): NextResponse => {
    const redirectResponse = NextResponse.redirect(targetUrl);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie as CookieOptions);
    }
    if (appToken) {
      redirectResponse.cookies.set(APP_SESSION_COOKIE, appToken, appSessionCookieOptions() as CookieOptions & { path: string });
    }
    return redirectResponse;
  };

  const dest = await resolveAuthDestination(user as any);

  if (!dest.requiresVerification && dest.providerVerified) {
    await markProfileVerified(user.id).catch(() => {});
    if (user.email) {
      await sendWelcomeEmailOnce(user.id, user.email).catch(() => {});
    }
  } else if (dest.requiresVerification) {
    try {
      await issueEmailVerificationCode({ id: user.id, email: user.email, fullName: (user.user_metadata as any)?.full_name ?? null });
    } catch {}
    const verifyUrl = new URL('/verify-email', origin);
    if (safeNext) verifyUrl.searchParams.set('next', safeNext);
    return buildRedirect(verifyUrl);
  }

  if (dest.needsCompletion) {
    const completeUrl = new URL('/complete-account', origin);
    if (safeNext) completeUrl.searchParams.set('next', safeNext);
    return buildRedirect(completeUrl);
  }

  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      const mfaUrl = new URL('/mfa-verify', origin);
      if (safeNext) mfaUrl.searchParams.set('next', safeNext);
      return buildRedirect(mfaUrl);
    }
  } catch {}

  const target = safeNext || '/dashboard';
  return buildRedirect(new URL(target, origin));
}
