import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
  }});
  const { data: { user } } = await supabase.auth.getUser();
  const protectedPath = request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname === '/onboarding';
  if (protectedPath && !user) { const redirect = request.nextUrl.clone(); redirect.pathname='/login'; redirect.searchParams.set('next',request.nextUrl.pathname); return NextResponse.redirect(redirect); }
  if (user && ['/login','/signup'].includes(request.nextUrl.pathname)) { const redirect=request.nextUrl.clone(); redirect.pathname='/dashboard'; return NextResponse.redirect(redirect); }
  return response;
}
export const config={matcher:['/dashboard/:path*','/onboarding','/login','/signup']};
