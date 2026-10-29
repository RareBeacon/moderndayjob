import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server client for Route Handlers / Server Actions (uses Next.js cookies()).
 * Use this in app/auth/callback/route.ts, Server Actions, and API routes
 * that need to exchange PKCE codes.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Next.js cookies() API requires explicit typing; maxAge stripped for session-only elsewhere if needed
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Helper for Middleware - mirrors Supabase SSR docs `updateSession`.
 * Creates a server client bound to the request/response, refreshes the
 * Supabase session via getUser(), and returns the response with updated cookies.
 * Does NOT exchange code - that belongs in /auth/callback only.
 */
export async function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  return { supabase, response };
}
