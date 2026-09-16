import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Pages that require an authenticated session. */
const PROTECTED = ['/dashboard', '/onboarding', '/profile', '/documents', '/applications', '/billing', '/match', '/generate', '/verify-email'];
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

/** Google sign-up email gate: true when the session is google-linked and the
 *  profile has not completed email verification yet (profiles.email_verified_at
 *  is null). Only google sessions pay the extra profile read; password
 *  accounts keep the existing instant-access policy. RLS profile_self allows
 *  the user-scoped client to read only their own row. */
async function needsGoogleEmailVerification(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  user: { id: string; app_metadata?: { providers?: string[]; [key: string]: unknown } | null },
): Promise<boolean> {
  if (!(user.app_metadata?.providers ?? []).includes('google')) return false;
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

  if (user && (await needsGoogleEmailVerification(supabase, user)) && pathname !== '/verify-email') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/verify-email';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/onboarding', '/profile', '/documents', '/applications', '/billing', '/jobs', '/match', '/generate', '/login', '/signup', '/verify-email'],
};
