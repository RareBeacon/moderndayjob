import { supabaseAdmin } from '@/lib/supabase';

export type AuthDestination = {
  requiresVerification: boolean;
  needsCompletion: boolean;
  providerVerified: boolean;
};

function isGoogleProvider(user: { app_metadata?: { providers?: string[] } | null; identities?: Array<{ provider: string }> | null }): boolean {
  const providers = user.app_metadata?.providers ?? [];
  const ids = user.identities?.map((i) => i.provider) ?? [];
  return providers.includes('google') || ids.includes('google');
}

function isLinkedInProvider(user: { app_metadata?: { providers?: string[] } | null; identities?: Array<{ provider: string }> | null }): boolean {
  const providers = user.app_metadata?.providers ?? [];
  const ids = user.identities?.map((i) => i.provider) ?? [];
  return providers.includes('linkedin_oidc') || providers.includes('linkedin') || ids.includes('linkedin_oidc') || ids.includes('linkedin');
}

function isSocialUser(user: Parameters<typeof isGoogleProvider>[0]): boolean {
  return isGoogleProvider(user) || isLinkedInProvider(user);
}

/**
 * Single authoritative routing decision after authentication.
 * Uses supabaseAdmin (service role) to read profiles - never trusts client input.
 * Rules:
 * - Password users: require verification if Supabase email_confirmed_at is null
 * - Social users: require verification if profiles.email_verified_at is null
 *   BUT: if Supabase already marks email_confirmed_at and provider is Google (verified email), we can auto-mark profiles verified to avoid double code
 * - Completion: social verified but missing phone or password_set_at → /complete-account
 */
export async function resolveAuthDestination(
  user: {
    id: string;
    email?: string | null;
    email_confirmed_at?: string | null;
    app_metadata?: { providers?: string[] } | null;
    identities?: Array<{ provider: string }> | null;
  },
): Promise<AuthDestination> {
  const social = isSocialUser(user);
  const google = isGoogleProvider(user);

  if (!social) {
    // Password / manual: Supabase email_confirmed_at is source of truth
    const requiresVerification = !user.email_confirmed_at;
    return { requiresVerification, needsCompletion: false, providerVerified: false };
  }

  // Social path
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email_verified_at, phone, password_set_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const row = profile as { email_verified_at: string | null; phone: string | null; password_set_at: string | null } | null;
  const profileVerified = Boolean(row?.email_verified_at);

  if (profileVerified) {
    const needsCompletion = !row?.phone || !row?.password_set_at;
    return { requiresVerification: false, needsCompletion: Boolean(needsCompletion), providerVerified: google };
  }

  // Not yet verified in profiles - can we trust Supabase's email_confirmed_at for Google?
  // Google's emails are verified by Google; Supabase sets email_confirmed_at when provider email is verified.
  // We auto-trust Google only; LinkedIn emails are not reliably verified and may be missing.
  if (google && user.email_confirmed_at) {
    return { requiresVerification: false, needsCompletion: !row?.phone || !row?.password_set_at, providerVerified: true };
  }

  return { requiresVerification: true, needsCompletion: false, providerVerified: false };
}

export async function markProfileVerified(userId: string): Promise<void> {
  await supabaseAdmin
    .from('profiles')
    .update({ email_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('email_verified_at', null);
}
