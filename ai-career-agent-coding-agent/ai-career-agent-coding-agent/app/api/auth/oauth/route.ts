import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { OAUTH_CTX_COOKIE, resolveRequestOrigin } from '@/lib/auth/oauth-origin';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type CookieToSet = { name: string; value: string; options: CookieOptions };

function safeNext(next?: string | null): string | null {
  if (!next) return null;
  const trimmed = next.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('://')) return null;
  return trimmed;
}

function safeFrom(from?: string | null): '/login' | '/signup' {
  return from === '/signup' ? '/signup' : '/login';
}

/**
 * GET /api/auth/oauth?provider=google|linkedin_oidc&from=/signup|/login&next=...
 *
 * Top-level navigation OAuth starter:
 * - Derives redirectTo from the exact validated request origin so the PKCE
 *   code-verifier cookie and /auth/callback share the identical host.
 * - Keeps redirectTo free of query parameters (`${origin}/auth/callback`) so
 *   Supabase's Redirect URLs allowlist matches even without wildcard patterns.
 * - Stores `{ next, from, provider }` in a 10-minute httpOnly cookie and writes
 *   all PKCE cookies directly onto the 302 redirect response.
 */
export async function GET(request: NextRequest) {
  const origin = resolveRequestOrigin(request);
  const url = new URL(request.url);
  const rawProvider = url.searchParams.get('provider');
  const from = safeFrom(url.searchParams.get('from'));
  const next = safeNext(url.searchParams.get('next'));

  const rl = await enforceRateLimit(`oauth:${requestIp(request as unknown as Request)}`, 20, '1 m');
  if (!rl.allowed) {
    const rateUrl = new URL(from, origin);
    rateUrl.searchParams.set('error', 'rate_limited');
    return NextResponse.redirect(rateUrl, 302);
  }

  const provider = rawProvider === 'google' || rawProvider === 'linkedin_oidc' ? rawProvider : null;
  if (!provider) {
    const errUrl = new URL(from, origin);
    errUrl.searchParams.set('error', 'oauth_failed');
    return NextResponse.redirect(errUrl, 302);
  }

  const secure = origin.startsWith('https://');
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

  const redirectTo = `${origin}/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });

  if (error || !data?.url) {
    const msg = error?.message ?? '';
    const unavailable = /provider|support|enabled|invalid|not found/i.test(msg);
    console.warn('[auth/oauth] signInWithOAuth failed', { provider, msg: msg.slice(0, 200) });
    const errUrl = new URL(from, origin);
    errUrl.searchParams.set('error', unavailable ? 'provider_disabled' : 'oauth_failed');
    errUrl.searchParams.set('provider', provider === 'linkedin_oidc' ? 'linkedin' : 'google');
    return NextResponse.redirect(errUrl, 302);
  }

  const res = NextResponse.redirect(data.url, 302);
  res.headers.set('Cache-Control', 'no-store');

  for (const [name, { value, options }] of pendingCookies.entries()) {
    res.cookies.set(name, value, {
      ...options,
      path: options.path || '/',
      sameSite: (options.sameSite as 'lax' | 'strict' | 'none' | undefined) ?? 'lax',
      secure: options.secure ?? secure,
    });
  }

  res.cookies.set(
    OAUTH_CTX_COOKIE,
    JSON.stringify({ next, from, provider }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 600,
    },
  );

  return res;
}
