import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
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
  // The access token always carries an `aal` claim for authenticated
  // sessions (aal1 for password-only, aal2 once MFA is completed).
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
  // Fail closed: an auth-service transport error on the Bearer path must
  // read as "not authenticated" (401), never as a 500 crash.
  let data: Awaited<ReturnType<typeof supabaseAdmin.auth.getUser>>['data'] | null = null;
  try {
    ({ data } = await supabaseAdmin.auth.getUser(token));
  } catch {
    return { user: null, needsMfa: false };
  }
  if (!data?.user) return { user: null, needsMfa: false };
  // Completed-MFA session: never gated.
  if (aalFromJwt(token) === 'aal2') return { user: data.user, needsMfa: false };
  // The aal claim is present on EVERY authenticated token (aal1 for plain
  // password sessions), so it cannot tell enrolled users from plain ones.
  // Ask the auth server for enrollment truth, mirroring the cookie path's
  // getAuthenticatorAssuranceLevel nextLevel semantics (2026-09-20 fix:
  // previously every aal1 Bearer token was wrongly gated with MFA_REQUIRED).
  const needsMfa = await userHasVerifiedMfaFactor(data.user.id);
  return { user: data.user, needsMfa };
}

/**
 * Server-side MFA enrollment truth for the Bearer path. Fail-open on
 * transport errors, matching the cookie path's policy: a spurious error
 * must not lock every API client behind a phantom MFA demand.
 */
async function userHasVerifiedMfaFactor(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}/factors`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return false;
    const factors = (await res.json()) as Array<{ status?: string }>;
    return Array.isArray(factors) && factors.some((f) => f.status === 'verified');
  } catch {
    return false;
  }
}

export async function getUser(req?: Request) {
  const supabase = await serverClient();
  // Fail soft on auth acquisition (2026-09-24 iOS incident, second round): a
  // Supabase auth hiccup or a revoked/mid-rotation session cookie makes
  // auth.getUser() throw instead of returning null, which crashed the
  // dashboard server render even after the UNAUTHENTICATED redirect fix.
  // Any failure here reads as anonymous: fail closed for access, never a 500.
  let user: User | null = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null;
  }
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
  // Same fail-soft policy as getUser(): a throwing auth call is an anonymous
  // visitor, not a server crash (2026-09-24 iOS incident).
  let user: User | null = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null;
  }
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

/**
 * Page-side gate (2026-09-24 iOS incident, second round): requireUser for
 * server components, with every auth outcome triaged into a redirect instead
 * of the error boundary. The first fix only handled UNAUTHENTICATED; the
 * live crash at 16:19Z proved other requireUser failures (MFA_REQUIRED,
 * ACCOUNT_*, auth-service throws) could still reach the boundary.
 *
 * - anonymous/broken session -> /login?next=<path> (re-login recovers)
 * - enrolled but unverified MFA -> /mfa-verify (matches the middleware)
 * - suspended/terminated -> sign out, then /login (no automatic loop: each
 *   pass requires a manual login)
 * - anything else rethrows to the error boundary (now instrumented)
 */
export async function requireUserOrRedirect(nextPath: string): Promise<User> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'UNAUTHENTICATED') {
        redirect(`/login?next=${encodeURIComponent(nextPath)}`);
      }
      if (error.message === 'MFA_REQUIRED') {
        redirect('/mfa-verify');
      }
      if (error.message.startsWith('ACCOUNT_')) {
        const client = await serverClient().catch(() => null);
        await client?.auth.signOut().catch(() => undefined);
        redirect(`/login?account=${error.message.toLowerCase()}`);
      }
    }
    throw error;
  }
}
