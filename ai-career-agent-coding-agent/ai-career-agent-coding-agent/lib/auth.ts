import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from './env';
import { supabaseAdmin } from './supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Auth context: session user + MFA assurance level (aal), decoded from the
 * session locally (no extra network roundtrip). needsMfa is true only when
 * the user has an enrolled/verified second factor AND the current session
 * has not completed it (aal1). Users without MFA never pay a difference.
 */
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

/**
 * Native-client auth path (backward-compatible addition for the mobile app).
 *
 * The website authenticates via Supabase SSR cookies; a native app cannot
 * use browser cookies, so it presents the Supabase access token it holds in
 * secure on-device storage as `Authorization: Bearer <token>`. Validation is
 * done by the auth provider itself (admin getUser verifies the JWT
 * signature); the token is never logged. Cookie sessions take precedence;
 * the Bearer path only runs when no cookie session exists, so web behavior
 * is bit-for-bit unchanged.
 */
function bearerToken(header: string | null): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function aalFromJwt(token: string): 'aal1' | 'aal2' {
  // The access token carries an `aal` claim once a factor is enrolled.
  // Signature is verified separately (admin getUser); this only reads it.
  try {
    const payload = token.split('.')[1];
    if (!payload) return 'aal1';
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8')) as { aal?: string };
    return json.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

async function bearerAuthContext(token: string): Promise<AuthContext> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { user: null, needsMfa: false };
  // needsMfa only when a factor is enrolled (the claim exists) but the
  // session has not completed it. No claim = no factors = never gated.
  let hasAalClaim = false;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8')) as { aal?: unknown };
    hasAalClaim = 'aal' in payload;
  } catch {
    hasAalClaim = false;
  }
  const needsMfa = hasAalClaim && aalFromJwt(token) !== 'aal2';
  return { user: data.user, needsMfa };
}

export async function getUser(req?: Request) {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user;
  if (req) {
    const token = bearerToken(req.headers.get('authorization'));
    if (token) {
      const ctx = await bearerAuthContext(token);
      return ctx.user;
    }
  }
  return null;
}

export async function getAuthContext(req?: Request): Promise<AuthContext> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
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
  const token = req ? bearerToken(req.headers.get('authorization')) : null;
  if (token) return bearerAuthContext(token);
  return { user: null, needsMfa: false };
}

/** Reject accounts that are SUSPENDED or TERMINATED (SECURITY_ARCHITECTURE:
 *  termination/suspension revokes practical access on API requests).
 *  Graceful: if the profile lookup fails, fall through rather than lock
 *  everyone out on an infra hiccup.
 *
 *  MFA enforcement: when the user has an enrolled factor and the session has
 *  not completed it (aal1), routes throw MFA_REQUIRED unless they explicitly
 *  opt out (auth-completion endpoints that must work mid-flow). Supabase
 *  remains the single source of truth for factor state.
 *
 *  Accepts an optional Request so native clients (which send a Bearer token
 *  instead of cookies) authenticate through the same gate. */
export async function requireUser(opts: { allowIncompleteMfa?: boolean; req?: Request } = {}) {
  const { user, needsMfa } = await getAuthContext(opts.req);
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
