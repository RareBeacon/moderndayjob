import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from './env';

export async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
export async function requireUser() { const user = await getUser(); if (!user) throw new Error('UNAUTHENTICATED'); return user; }
