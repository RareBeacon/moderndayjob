import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from './env';
import { supabaseAdmin } from './supabase';

/**
 * Auth context: session user + MFA assurance level (aal), decoded from the
 * session locally (no extra network roundtrip). needsMfa is true only when
 * the user has an enrolled/verified second factor AND the current session
 * has not completed it (aal1). Users without MFA never pay a difference.
 */
import type { User } from '@supabase/supabase-js';

export type AuthContext = {
  user: User | null;
  needsMfa: boolean;
};

async function serverClient() {
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
  });
}

export async function getUser() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, needsMfa: false };
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa = aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2';
    return { user, needsMfa };
  } catch {
    // Defense-in-depth only; page gating happens in middleware. Fail open
    // so a decode hiccup cannot lock every API behind a spurious MFA error.
    return { user, needsMfa: false };
  }
}

/** Reject accounts that are SUSPENDED or TERMINATED (SECURITY_ARCHITECTURE:
 *  termination/suspension revokes practical access on API requests).
 *  Graceful: if the profile lookup fails, fall through rather than lock
 *  everyone out on an infra hiccup.
 *
 *  MFA enforcement: when the user has an enrolled factor and the session has
 *  not completed it (aal1), routes throw MFA_REQUIRED unless they explicitly
 *  opt out (auth-completion endpoints that must work mid-flow). Supabase
 *  remains the single source of truth for factor state. */
export async function requireUser(opts: { allowIncompleteMfa?: boolean } = {}) {
  const { user, needsMfa } = await getAuthContext();
  if (!user) throw new Error('UNAUTHENTICATED');
  if (needsMfa && !opts.allowIncompleteMfa) throw new Error('MFA_REQUIRED');
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
