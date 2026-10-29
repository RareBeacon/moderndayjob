import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAppSession, appSessionCookieOptions, APP_SESSION_COOKIE } from '@/lib/session';
import { ensureProfile } from '@/lib/auth/profile';
import { resolveAuthDestination, markProfileVerified } from '@/lib/auth/routing';
import { issueEmailVerificationCode } from '@/lib/auth-oauth';

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
 * Unified OAuth callback — the ONLY place exchangeCodeForSession happens.
 * Follows Supabase PKCE docs: https://supabase.com/docs/guides/auth/server-side/creating-a-client
 * - Exchanges `code` for session (httpOnly PKCE verifier cookie)
 * - Ensures profile exists idempotently
 * - Applies central routing rule (new vs existing, verified vs unverified, completion)
 * - Creates app session (30m/7d, session-only) on server — never via client fetch
 * - Redirects to /verify-email, /complete-account, or /dashboard (+ next)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');
  const errorCode = url.searchParams.get('error_code');

  // Provider returned an error (user cancelled)
  if (error) {
    if (error === 'access_denied') return errorRedirect(origin, 'oauth_cancelled');
    return errorRedirect(origin, 'oauth_failed');
  }

  const supabase = await createSupabaseServerClient();

  // Exchange PKCE code if present
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const msg = exchangeError.message || '';
      const alreadyUsed = /already been used|flow_state|bad_oauth_state/i.test(msg) || errorCode === 'flow_state_already_used';
      if (alreadyUsed) {
        // Idempotent: code already consumed, check if session now exists
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) return errorRedirect(origin, 'session_expired');
        // Fall through to normal routing with existing session
      } else {
        return errorRedirect(origin, 'oauth_failed');
      }
    }
  }

  // No code but user may already have session (e.g., refresh)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // No session — send back to login (with error if we had a code)
    return errorRedirect(origin, code ? 'session_expired' : 'oauth_failed');
  }

  // Idempotent profile provisioning — never duplicate, never overwrite
  await ensureProfile(user).catch(() => {});

  // Central routing decision
  const dest = await resolveAuthDestination(user as any);

  // Auto-verify Google users whose Supabase email is already confirmed
  if (!dest.requiresVerification && dest.providerVerified) {
    await markProfileVerified(user.id).catch(() => {});
  } else if (dest.requiresVerification) {
    // Issue code for those who need verification (respects 60s cooldown idempotently)
    try {
      await issueEmailVerificationCode({ id: user.id, email: user.email, fullName: (user.user_metadata as any)?.full_name ?? null });
    } catch {}
    const verifyUrl = new URL('/verify-email', origin);
    return NextResponse.redirect(verifyUrl);
  }

  if (dest.needsCompletion) {
    const url2 = new URL('/complete-account', origin);
    return NextResponse.redirect(url2);
  }

  // MFA gate (if enrolled, require second factor before dashboard)
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      return NextResponse.redirect(new URL('/mfa-verify', origin));
    }
  } catch {}

  // Establish app session on server (httpOnly, session-only, 30m idle / 7d absolute)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;
  const ua = request.headers.get('user-agent');
  let appToken: string | null = null;
  try {
    const created = await createAppSession({ userId: user.id, ip, userAgent: ua });
    appToken = created.token;
  } catch {}

  const safeNext = safeRedirectTarget(nextParam);
  const target = safeNext || '/dashboard';
  const redirectUrl = new URL(target, origin);
  const response = NextResponse.redirect(redirectUrl);
  if (appToken) {
    response.cookies.set(APP_SESSION_COOKIE, appToken, appSessionCookieOptions() as any);
  }
  return response;
}
