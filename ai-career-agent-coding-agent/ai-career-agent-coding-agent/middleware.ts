import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { APP_SESSION_COOKIE, validateAppSession, touchAppSession, appSessionCookieOptions } from './lib/session';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Pages that require an authenticated session. /verify-email is NOT here:
 *  its password-signup mode is deliberately pre-session (the account exists
 *  but is unverified, so there is no session to gate on); walling it off
 *  sent those users into a login redirect loop (fixed 2026-09-21). The page
 *  itself sends anonymous visitors without an ?email= context to /login. */
const PROTECTED = ['/dashboard', '/onboarding', '/profile', '/settings', '/documents', '/applications', '/billing', '/generate', '/mfa-verify', '/complete-account'];
/** Auth pages an already-signed-in user should not see (only when app session valid). */
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
  // Force session-only: remove maxAge/expires so cookie dies with browser session
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
          // Session-only enforcement: strip persistence from Supabase cookies
          const sessionOpts = sessionCookieOptionsWithoutPersistence(options);
          response.cookies.set(name, value, sessionOpts);
        });
      },
    },
  });

  // Handle OAuth callback code exchange (PKCE) - idempotent
  // If request contains ?code=, attempt server-side exchange before checking session
  // This prevents flow_state_already_used double-exchange errors
  const code = request.nextUrl.searchParams.get('code');
  const errorCode = request.nextUrl.searchParams.get('error_code');
  const errorDesc = request.nextUrl.searchParams.get('error_description');
  
  if (code && (pathname === '/auth/callback' || pathname === '/')) {
    try {
      // Only attempt exchange if we don't already have a valid session
      // The browser client (detectSessionInUrl) may have already exchanged
      const { data: existingSession } = await supabase.auth.getSession();
      if (!existingSession?.session) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          const msg = exchangeError.message || '';
          const isAlreadyUsed = /already been used|flow_state/i.test(msg) || errorCode === 'flow_state_already_used';
          if (isAlreadyUsed) {
            // Code already consumed - check if we now have a session (client may have exchanged)
            const { data: retrySession } = await supabase.auth.getSession();
            if (retrySession?.session) {
              // Already authenticated via previous exchange - clean URL and continue to normal flow
              const cleanUrl = request.nextUrl.clone();
              cleanUrl.searchParams.delete('code');
              cleanUrl.searchParams.delete('error');
              cleanUrl.searchParams.delete('error_code');
              cleanUrl.searchParams.delete('error_description');
              cleanUrl.searchParams.delete('state');
              return NextResponse.redirect(cleanUrl);
            }
            // No session despite already-used - log safely and redirect to login with retry message
            console.warn('[auth] OAuth code already used without session - redirecting to login', { pathname, errorCode });
            const redirect = request.nextUrl.clone();
            redirect.pathname = '/login';
            redirect.searchParams.delete('code');
            redirect.searchParams.delete('state');
            redirect.searchParams.delete('error');
            redirect.searchParams.delete('error_code');
            redirect.searchParams.delete('error_description');
            redirect.searchParams.set('error', 'session_expired');
            return NextResponse.redirect(redirect);
          }
          // Other exchange errors - log and redirect to login with error
          console.warn('[auth] OAuth code exchange failed', { pathname, error: msg.slice(0, 100) });
          const redirect = request.nextUrl.clone();
          redirect.pathname = '/login';
          redirect.search = '';
          redirect.searchParams.set('error', 'oauth_failed');
          return NextResponse.redirect(redirect);
        }
        // Successful exchange - create response with updated cookies and redirect to clean URL
        // The supabase client already set cookies via setAll callback above
        const cleanUrl = request.nextUrl.clone();
        cleanUrl.searchParams.delete('code');
        cleanUrl.searchParams.delete('state');
        // Preserve next param if present
        return NextResponse.redirect(cleanUrl);
      } else {
        // Already have session - just clean URL (idempotent - prevents double exchange)
        const cleanUrl = request.nextUrl.clone();
        cleanUrl.searchParams.delete('code');
        cleanUrl.searchParams.delete('state');
        return NextResponse.redirect(cleanUrl);
      }
    } catch (e) {
      console.warn('[auth] OAuth code handling error', { pathname, error: e instanceof Error ? e.message.slice(0, 100) : 'unknown' });
    }
  }

  // OAuth error on site root is handled client-side in HomeClient (see app/HomeClient.tsx)

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null;
  }

  // App-session validation (skip for /verify-email which is pre-session for password signups)
  let appSessionValid = false;
  let appSessionRow: { id: string; user_id: string; token_hash: string; created_at: string; last_active_at: string; expires_at: string; revoked_at: string | null } | null = null;
  if (user && pathname !== '/verify-email') {
    const appToken = request.cookies.get(APP_SESSION_COOKIE)?.value;
    if (appToken) {
      try {
        const v = await validateAppSession({ token: appToken, userId: user.id });
        if (v.valid) {
          appSessionValid = true;
          appSessionRow = v.row as any;
        } else {
          // Expired/revoked — will clear cookie and redirect
          appSessionValid = false;
        }
      } catch {
        appSessionValid = false;
      }
    }
  }

  // Protected pages require BOTH Supabase identity AND valid app session (except verify-email)
  if (isProtected(pathname) && user && !appSessionValid) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', pathname);
    const res = NextResponse.redirect(redirect);
    res.cookies.set(APP_SESSION_COOKIE, '', { ...appSessionCookieOptions(), maxAge: 0 } as CookieOptions & { maxAge: number });
    return res;
  }

  if (isProtected(pathname) && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  // Touch last_active throttled on authenticated protected requests (qualifying activity)
  if (user && appSessionValid && appSessionRow) {
    // Only count genuine page navigations as qualifying activity, not background polls
    // For now every protected page visit counts; API polling excluded via middleware matcher
    await touchAppSession(appSessionRow as any).catch(() => {});
  }

  if (user && pathname !== '/verify-email') {
    // Defense in depth: password sessions with unconfirmed email go to verify-email
    // (social has separate profile gate)
    if (!isSocialProvider(user) && !user.email_confirmed_at && pathname !== '/verify-email') {
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/verify-email';
      redirect.search = '';
      if (user.email) redirect.searchParams.set('email', user.email);
      const res = NextResponse.redirect(redirect);
      // Keep app session touch if valid
      return res;
    }
    // Social gates only when app session valid — otherwise user must re-login anyway
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

  // MFA gate (only when app session valid)
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

  // Auth pages redirect only when app session valid (prevents loop for expired app session)
  if (user && appSessionValid && AUTH_PAGES.includes(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/auth/callback', '/dashboard/:path*', '/onboarding', '/profile', '/settings', '/documents', '/applications', '/billing', '/generate', '/login', '/signup', '/verify-email', '/mfa-verify', '/complete-account'],
};
