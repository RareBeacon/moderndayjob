import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAppSession, appSessionCookieOptions, APP_SESSION_COOKIE } from '@/lib/session';
import { ensureProfile } from '@/lib/auth/profile';
import { resolveAuthDestination, markProfileVerified } from '@/lib/auth/routing';
import { issueEmailVerificationCode } from '@/lib/auth-oauth';
import { sendWelcomeEmailOnce } from '@/lib/email/welcome';
import { ensurePeriodGrants } from '@/lib/credits';
import { OAUTH_CTX_COOKIE, resolveRequestOrigin } from '@/lib/auth/oauth-origin';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type CookieToSet = { name: string; value: string; options: CookieOptions };

type OAuthCtx = {
  next?: string | null;
  from?: '/login' | '/signup';
  provider?: string;
};

function safeRedirectTarget(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (next.includes('://')) return null;
  return next;
}

function readOAuthCtx(request: NextRequest): OAuthCtx {
  const raw = request.cookies.get(OAUTH_CTX_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as OAuthCtx;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sessionCookieOptionsWithoutPersistence(opts: CookieOptions, secure: boolean): CookieOptions {
  if (opts.maxAge === 0) {
    return { ...opts, path: opts.path || '/', secure: opts.secure ?? secure };
  }
  const { maxAge, expires, ...rest } = opts as CookieOptions & { maxAge?: number; expires?: Date };
  return {
    ...rest,
    path: rest.path || '/',
    sameSite: (rest.sameSite as 'lax' | 'strict' | 'none' | undefined) ?? 'lax',
    secure: rest.secure ?? secure,
  };
}

/**
 * Unified OAuth callback - the ONLY place exchangeCodeForSession happens.
 * Accumulates all @supabase/ssr Set-Cookie writes without clobbering across
 * calls and mints `jobiest_app_session` before routing to /verify-email,
 * /complete-account, /mfa-verify, or /dashboard.
 */
export async function GET(request: NextRequest) {
  const origin = resolveRequestOrigin(request);
  const secure = origin.startsWith('https://');
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const ctx = readOAuthCtx(request);
  const safeNext = safeRedirectTarget(url.searchParams.get('next') ?? ctx.next);
  const errorBase = ctx.from === '/signup' ? '/signup' : '/login';
  const error = url.searchParams.get('error');
  const errorCode = url.searchParams.get('error_code');
  const errorDescription = url.searchParams.get('error_description') ?? '';

  const clearTransientCookies = (res: NextResponse) => {
    res.cookies.set(OAUTH_CTX_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
    for (const c of request.cookies.getAll()) {
      if (c.name.endsWith('-code-verifier')) {
        res.cookies.set(c.name, '', { path: '/', sameSite: 'lax', secure, maxAge: 0 });
      }
    }
  };

  const errorRedirect = (errCode: string): NextResponse => {
    const errUrl = new URL(errorBase, origin);
    errUrl.searchParams.set('error', errCode);
    if (ctx.provider) {
      errUrl.searchParams.set('provider', ctx.provider === 'linkedin_oidc' ? 'linkedin' : 'google');
    }
    const res = NextResponse.redirect(errUrl, 302);
    res.headers.set('Cache-Control', 'no-store');
    clearTransientCookies(res);
    return res;
  };

  if (error) {
    console.warn('[auth/callback] provider returned error', { error, errorCode, desc: errorDescription.slice(0, 160) });
    if (error === 'access_denied') return errorRedirect('oauth_cancelled');
    if (/provider.*not enabled|unsupported provider/i.test(errorDescription)) return errorRedirect('provider_disabled');
    return errorRedirect('oauth_failed');
  }

  const pendingCookies = new Map<string, { value: string; options: CookieOptions }>();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          pendingCookies.set(name, { value, options });
        }
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
          console.warn('[auth/callback] flow_state_already_used without session', { errorCode, msg: msg.slice(0, 120) });
          return errorRedirect('session_expired');
        }
      } else {
        console.warn('[auth/callback] exchange failed', { msg: msg.slice(0, 200), errorCode });
        return errorRedirect('oauth_failed');
      }
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[auth/callback] no user after exchange', { hasCode: Boolean(code), errorCode });
    return errorRedirect(code ? 'session_expired' : 'oauth_failed');
  }

  await ensureProfile(user).catch((e) => console.warn('[auth/callback] ensureProfile failed', (e as Error).message.slice(0, 120)));
  await ensurePeriodGrants(user.id).catch(() => {});

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;
  const ua = request.headers.get('user-agent');
  let appToken: string | null = null;
  try {
    const created = await createAppSession({ userId: user.id, ip, userAgent: ua });
    appToken = created.token;
  } catch (e) {
    console.warn('[auth/callback] createAppSession failed', (e as Error).message.slice(0, 120));
  }

  const buildRedirect = (targetUrl: URL): NextResponse => {
    const redirectResponse = NextResponse.redirect(targetUrl, 302);
    redirectResponse.headers.set('Cache-Control', 'no-store');
    redirectResponse.cookies.set(OAUTH_CTX_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
    for (const [name, { value, options }] of pendingCookies.entries()) {
      redirectResponse.cookies.set(name, value, sessionCookieOptionsWithoutPersistence(options, secure));
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
