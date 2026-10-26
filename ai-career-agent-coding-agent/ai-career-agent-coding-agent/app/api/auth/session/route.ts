import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getUser } from '@/lib/auth';
import { createAppSession, appSessionCookieOptions, APP_SESSION_COOKIE, revokeAppSessionByToken } from '@/lib/session';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  const rl = await enforceRateLimit(`auth:session:${requestIp(req)}`, 20, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await getUser(req as unknown as Request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  // Create app session for this Supabase-authenticated user
  const ip = requestIp(req);
  const ua = req.headers.get('user-agent');
  const { token } = await createAppSession({ userId: user.id, ip, userAgent: ua });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_SESSION_COOKIE, token, appSessionCookieOptions() as CookieOptions & { path: string });
  return res;
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(APP_SESSION_COOKIE)?.value;
  if (token) await revokeAppSessionByToken(token).catch(() => {});
  const res = NextResponse.json({ ok: true });
  // Clear cookie
  res.cookies.set(APP_SESSION_COOKIE, '', {
    ...appSessionCookieOptions(),
    maxAge: 0,
  } as CookieOptions & { path: string; maxAge: number });
  // Also clear Supabase session via SSR client if present
  try {
    const anonUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const jar = req.cookies;
    const anonClient = createServerClient(anonUrl, anonKey, {
      cookies: { getAll: () => jar.getAll(), setAll: () => {} },
    });
    await anonClient.auth.signOut().catch(() => {});
  } catch {}
  return res;
}
