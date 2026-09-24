import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Pages that require an authenticated session. /verify-email is NOT here:
 *  its password-signup mode is deliberately pre-session (the account exists
 *  but is unverified, so there is no session to gate on); walling it off
 *  sent those users into a login redirect loop (fixed 2026-09-21). The page
 *  itself sends anonymous visitors without an ?email= context to /login. */
const PROTECTED = ['/dashboard', '/onboarding', '/profile', '/settings', '/documents', '/applications', '/billing', '/generate', '/mfa-verify', '/complete-account'];
/** Auth pages an already-signed-in user should not see. */
const AUTH_PAGES = ['/login', '/signup'];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Social sign-up email gate + account-completion gate: social sessions
 *  (google / linkedin) must verify their email (profiles.email_verified_at)
 *  and then set a password + phone (owner brief 2026-09-21) before the app
 *  opens. Only social sessions pay the profile read; password accounts
 *  complete at registration. RLS profile_self allows the user-scoped client
 *  to read only their own row. */
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
    // Honest completeness signal: phone + password_set_at. (Reading
    // app_metadata for 'email' was wrong - it does not update when a
    // password is set for a social account.)
    needsCompletion: verified && (!row?.phone || !row?.password_set_at),
  };
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  const { pathname } = request.nextUrl;

  // The homepage '/' is fully public and is NOT in the matcher: middleware
  // never runs on it (2026-09-24 fix). The previous fast-path redirected any
  // visitor with a mere session-cookie PRESENCE to /dashboard without
  // validating the session, so every browser holding an expired/stale cookie
  // experienced  /  ->  /dashboard  ->  /login?next=%2Fdashboard. The
  // homepage must never inherit a protected route's destination; requested
  // URL determines destination.

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

  // Fail soft (2026-09-24 iOS incident): a throwing auth call (hiccup or
  // revoked mid-rotation session) reads as anonymous; the protected-path
  // redirect below handles it instead of a middleware 500.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null;
  }

  if (isProtected(pathname) && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  if (user) {
    const { needsVerification, needsCompletion } = await socialGates(supabase, user);
    if (needsVerification && pathname !== '/verify-email') {
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/verify-email';
      redirect.search = '';
      return NextResponse.redirect(redirect);
    }
    // Verified social accounts without a password + phone complete them
    // first (email/MFA screens stay reachable so no loop forms).
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
  matcher: ['/dashboard/:path*', '/onboarding', '/profile', '/settings', '/documents', '/applications', '/billing', '/generate', '/login', '/signup', '/verify-email', '/mfa-verify', '/complete-account'],
};
