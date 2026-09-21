import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Pages that require an authenticated session. /verify-email is NOT here:
 *  its password-signup mode is deliberately pre-session (the account exists
 *  but is unverified, so there is no session to gate on); walling it off
 *  sent those users into a login redirect loop (fixed 2026-09-21). The page
 *  itself sends anonymous visitors without an ?email= context to /login. */
const PROTECTED = ['/dashboard', '/onboarding', '/profile', '/settings', '/documents', '/applications', '/billing', '/generate', '/mfa-verify'];
/** Auth pages an already-signed-in user should not see. */
const AUTH_PAGES = ['/login', '/signup'];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Fast session-cookie presence check for the marketing homepage only. The
 * homepage is high-traffic and must not pay for a full getUser() roundtrip;
 * a stale cookie simply means /dashboard re-validates (requireUser) and bounces
 * to /login. Real gating always happens server-side in route handlers.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
}

/** Social sign-up email gate: true when the session is google- or
 *  linkedin-linked and the profile has not completed email verification yet
 *  (profiles.email_verified_at is null). Only social sessions pay the extra
 *  profile read; password accounts keep the existing instant-access policy
 *  (their gate is the 6-digit code before the first sign-in). RLS
 *  profile_self allows the user-scoped client to read only their own row. */
function isSocialProvider(user: { app_metadata?: { providers?: string[]; [key: string]: unknown } | null }): boolean {
  const providers = user.app_metadata?.providers ?? [];
  return providers.includes('google') || providers.includes('linkedin_oidc') || providers.includes('linkedin');
}

async function needsEmailVerificationGate(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  user: { id: string; app_metadata?: { providers?: string[]; [key: string]: unknown } | null },
): Promise<boolean> {
  if (!isSocialProvider(user)) return false;
  const { data } = await supabase
    .from('profiles')
    .select('email_verified_at')
    .eq('user_id', user.id)
    .maybeSingle();
  const row = data as { email_verified_at: string | null } | null;
  return !row?.email_verified_at;
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  const { pathname } = request.nextUrl;

  // Authenticated visitors never see the marketing homepage: one clear home.
  if (pathname === '/' && hasSessionCookie(request)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    return NextResponse.redirect(redirect);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: CookieToSet[]) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (isProtected(pathname) && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && (await needsEmailVerificationGate(supabase, user)) && pathname !== '/verify-email') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/verify-email';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  // MFA gate: sessions with an enrolled factor that has not been completed
  // (aal1) go to /mfa-verify before any protected page opens. Supabase's
  // assurance level is decoded from the session; no extra DB read.
  if (user && pathname !== '/mfa-verify' && pathname !== '/verify-email') {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
        const redirect = request.nextUrl.clone();
        redirect.pathname = '/mfa-verify';
        redirect.search = '';
        return NextResponse.redirect(redirect);
      }
    } catch {
      // fail open; requireUser re-checks on data access
    }
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/onboarding', '/profile', '/settings', '/documents', '/applications', '/billing', '/generate', '/login', '/signup', '/verify-email', '/mfa-verify'],
};
