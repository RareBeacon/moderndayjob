import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { APP_SESSION_COOKIE, validateAppSession, touchAppSession, appSessionCookieOptions } from './lib/session';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Pages that require an authenticated session. /verify-email is NOT here (pre-session for password signups / social gate). */
const PROTECTED = ['/dashboard', '/onboarding', '/profile', '/settings', '/documents', '/applications', '/billing', '/generate', '/auto-apply', '/admin', '/mfa-verify', '/complete-account'];
const AUTH_PAGES = ['/login', '/signup'];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isSocialProvider(user: { app_metadata?: { providers?: string[]; [key: string]: unknown } | null }): boolean {
  const providers = user.app_metadata?.providers ?? [];
  return providers.includes('google') || providers.includes('linkedin_oidc') || providers.includes('linkedin');
}

async function socialGates(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  user: { id: string; app_metadata?: { providers?: string[]; [key: string]: unknown } | null },
): Promise<{ needsVerification: boolean; needsCompletion: boolean }> {
  if (!isSocialProvider(user)) return { needsVerification: false, needsCompletion: false };
  const { data } = await supabase
    .from('profiles')
    .select('email_verified_at, phone, password_set_at')
    .eq('user_id', user.id)
    .maybeSingle();
  const row = data as { email_verified_at: string | null; phone: string | null; password_set_at: string | null } | null;
  const verified = Boolean(row?.email_verified_at);
  return {
    needsVerification: !verified,
    needsCompletion: verified && (!row?.phone || !row?.password_set_at),
  };
}

function sessionCookieOptionsWithoutPersistence(opts: CookieOptions): CookieOptions {
  const { maxAge, expires, ...rest } = opts as CookieOptions & { maxAge?: number; expires?: Date };
  return rest;
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: CookieToSet[]) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => {
          const sessionOpts = sessionCookieOptionsWithoutPersistence(options);
          response.cookies.set(name, value, sessionOpts);
        });
      },
    },
  });

  // NOTE: No code exchange here. PKCE exchange lives ONLY in app/auth/callback/route.ts
  // per Supabase SSR docs. Middleware only refreshes session via getUser() (which updates cookies via setAll above).
  // This fixes bad_oauth_state / flow_state_already_used double-exchange.

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null;
  }

  let appSessionValid = false;
  let appSessionRow: { id: string; user_id: string; token_hash: string; created_at: string; last_active_at: string; expires_at: string; revoked_at: string | null } | null = null;
  let appSessionReason = 'NO_CHECK';
  if (user && pathname !== '/verify-email') {
    const appToken = request.cookies.get(APP_SESSION_COOKIE)?.value;
    if (!appToken) {
      appSessionReason = 'NO_APP_COOKIE';
    } else {
      try {
        const v = await validateAppSession({ token: appToken, userId: user.id });
        if (v.valid) {
          appSessionValid = true;
          appSessionRow = v.row as any;
          appSessionReason = 'VALID';
        } else {
          appSessionValid = false;
          appSessionReason = (v as any).reason || 'INVALID';
          console.warn(`[middleware] appSession invalid user=${user.id.slice(0,8)} reason=${appSessionReason} path=${pathname}`);
        }
      } catch (e: any) {
        appSessionValid = false;
        appSessionReason = `EXCEPTION:${e?.message?.slice(0,80) || 'unknown'}`;
        console.warn(`[middleware] appSession exception ${appSessionReason} path=${pathname}`);
      }
    }
  } else if (!user) {
    appSessionReason = 'NO_SUPABASE_USER';
  }

  if (isProtected(pathname) && user && !appSessionValid) {
    console.warn(`[middleware] bounce to login: protected=${pathname} user=${user.id.slice(0,8)} reason=${appSessionReason} hasAppCookie=${Boolean(request.cookies.get(APP_SESSION_COOKIE)?.value)}`);
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', pathname);
    if (appSessionReason === 'IDLE_EXPIRED' || appSessionReason === 'ABSOLUTE_EXPIRED') {
      redirect.searchParams.set('expired', '1');
    }
    const res = NextResponse.redirect(redirect);
    // Do not delete app cookie here - keep it so /api/debug/session can show why it was invalid; callback will overwrite on next login
    return res;
  }

  if (isProtected(pathname) && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && appSessionValid && appSessionRow) {
    const refreshedToken = await touchAppSession(appSessionRow as any).catch(() => undefined);
    if (typeof refreshedToken === 'string') {
      response.cookies.set(APP_SESSION_COOKIE, refreshedToken, appSessionCookieOptions());
    }
  }

  if (user && pathname !== '/verify-email') {
    if (!isSocialProvider(user) && !user.email_confirmed_at && pathname !== '/verify-email') {
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/verify-email';
      redirect.search = '';
      if (user.email) redirect.searchParams.set('email', user.email);
      return NextResponse.redirect(redirect);
    }
    if (appSessionValid) {
      const { needsVerification, needsCompletion } = await socialGates(supabase, user);
      if (needsVerification && pathname !== '/verify-email') {
        const redirect = request.nextUrl.clone();
        redirect.pathname = '/verify-email';
        redirect.search = '';
        return NextResponse.redirect(redirect);
      }
      if (
        needsCompletion &&
        pathname !== '/complete-account' &&
        pathname !== '/verify-email' &&
        pathname !== '/mfa-verify'
      ) {
        const redirect = request.nextUrl.clone();
        redirect.pathname = '/complete-account';
        redirect.search = '';
        return NextResponse.redirect(redirect);
      }
    }
  }

  if (user && appSessionValid && pathname !== '/mfa-verify' && pathname !== '/verify-email') {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
        const redirect = request.nextUrl.clone();
        redirect.pathname = '/mfa-verify';
        redirect.search = '';
        return NextResponse.redirect(redirect);
      }
    } catch {}
  }

  if (user && appSessionValid && AUTH_PAGES.includes(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    '/auth/callback',
    '/dashboard/:path*',
    '/onboarding/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/documents/:path*',
    '/applications/:path*',
    '/billing/:path*',
    '/generate/:path*',
    '/auto-apply/:path*',
    '/admin/:path*',
    '/login',
    '/signup',
    '/verify-email',
    '/mfa-verify',
    '/complete-account',
  ],
};
