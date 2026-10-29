import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { APP_SESSION_COOKIE, validateAppSession } from '@/lib/session';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

// Diagnostic endpoint - rate limited to prevent enumeration


type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function GET(request: NextRequest) {
  const rl = await enforceRateLimit(`debug:${requestIp(request as unknown as Request)}`, 30, "1 m");
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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

  let user: any = null;
  let userError: string | null = null;
  try {
    const r = await supabase.auth.getUser();
    user = r.data.user;
    if (r.error) userError = r.error.message;
  } catch (e: any) {
    userError = e?.message ?? String(e);
  }

  const appToken = request.cookies.get(APP_SESSION_COOKIE)?.value ?? null;
  const appTokenPreview = appToken ? `${appToken.slice(0, 8)}...${appToken.slice(-4)} len=${appToken.length}` : null;
  const cookiesSeen = request.cookies.getAll().map((c) => ({ name: c.name, len: c.value.length, preview: c.value.slice(0, 12) + '...' }));

  let appValidation: any = null;
  if (appToken && user) {
    try {
      const v = await validateAppSession({ token: appToken, userId: user.id });
      appValidation = v;
    } catch (e: any) {
      appValidation = { valid: false, reason: 'EXCEPTION', error: e?.message };
    }
  } else if (!appToken) {
    appValidation = { valid: false, reason: 'NO_APP_COOKIE' };
  } else if (!user) {
    appValidation = { valid: false, reason: 'NO_SUPABASE_USER' };
  }

  // Also check profile
  let profile: any = null;
  if (user) {
    try {
      const { data } = await supabase.from('profiles').select('email_verified_at, phone, password_set_at').eq('user_id', user.id).maybeSingle();
      profile = data;
    } catch {}
  }

  const body: any = {
    time: new Date().toISOString(),
    hasSupabaseUser: Boolean(user),
    user: user ? { id: user.id, email: user.email, email_confirmed_at: user.email_confirmed_at, providers: (user.app_metadata as any)?.providers, identities: (user.identities ?? []).map((i: any) => i.provider) } : null,
    userError,
    appTokenPreview,
    appTokenPresent: Boolean(appToken),
    appValidation,
    profile,
    cookiesSeen,
    supabaseUrl: url.slice(0, 40) + '...',
  };

  // Copy supabase cookies to response so session refresh persists
  const res = NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
  for (const c of response.cookies.getAll()) {
    res.cookies.set(c.name, c.value, c as any);
  }
  return res;
}
