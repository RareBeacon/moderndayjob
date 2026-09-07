import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from './env';
import { supabaseAdmin } from './supabase';

export async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Reject accounts that are SUSPENDED or TERMINATED (SECURITY_ARCHITECTURE:
 *  termination/suspension revokes practical access on API requests).
 *  Graceful: if the profile lookup fails, fall through rather than lock
 *  everyone out on an infra hiccup. */
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('account_status')
      .eq('user_id', user.id)
      .maybeSingle();
    const status = data?.account_status;
    if (status === 'SUSPENDED' || status === 'TERMINATED') {
      throw new Error(`ACCOUNT_${status}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ACCOUNT_')) throw error;
  }
  return user;
}
