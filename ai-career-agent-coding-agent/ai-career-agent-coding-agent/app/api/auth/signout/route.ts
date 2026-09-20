import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * POST /api/auth/signout · ends the session and returns the visitor to
 * the homepage. The app shell submits this as a plain HTML form post,
 * so the response must be a 303 redirect, never raw JSON, otherwise
 * the browser navigates to a JSON blob.
 */
export async function POST(req: Request) {
  const rl = await enforceRateLimit(`auth:signout:${requestIp(req)}`, 10, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const jar = await cookies();
  const response = NextResponse.redirect(new URL('/', req.url), 303);
  const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items: { name: string; value: string; options: CookieOptions }[]) =>
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  await client.auth.signOut();
  return response;
}
