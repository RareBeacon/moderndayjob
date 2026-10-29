import { supabaseAdmin } from '@/lib/supabase';

/**
 * Ensure a profiles row exists for this user. Idempotent — uses admin client
 * so it works even when the user's own session cannot yet read profiles (RLS).
 * The DB trigger `handle_new_user` already does this for most signups, but
 * concurrent OAuth callbacks can race it; this fills the gap without overwriting
 * existing data.
 */
export async function ensureProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const userId = user.id;
  const email = typeof user.email === 'string' ? user.email.toLowerCase().trim() : null;
  const meta = user.user_metadata ?? {};
  const fullName =
    typeof meta.full_name === 'string'
      ? meta.full_name.trim()
      : typeof meta.name === 'string'
        ? meta.name.trim()
        : typeof meta.fullName === 'string'
          ? meta.fullName.trim()
          : null;
  const avatarUrl =
    typeof meta.avatar_url === 'string'
      ? meta.avatar_url
      : typeof meta.picture === 'string'
        ? meta.picture
        : null;

  // Check existence first to avoid unnecessary writes
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return;

  // Insert minimal row; RLS-safe via service_role. ON CONFLICT ensures idempotency.
  await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        email: email ?? null,
        full_name: fullName ?? null,
        avatar_url: avatarUrl ?? null,
        // email_verified_at stays null until verification step; phone/password_set_at null for social
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: false },
    )
    .select()
    .maybeSingle();

}
