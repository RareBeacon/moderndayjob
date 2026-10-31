import { supabaseAdmin } from '@/lib/supabase';

/**
 * Ensure a profiles row (plus workspace, membership, and starter subscription)
 * exists for this user. Idempotent - uses admin client so it works even when
 * the user's own session cannot yet read profiles (RLS).
 * The DB trigger `handle_new_user` already creates these on signup, and this
 * fills any race or backfill gap using the exact `public.profiles` schema.
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
    typeof meta.full_name === 'string' && meta.full_name.trim()
      ? meta.full_name.trim()
      : typeof meta.name === 'string' && meta.name.trim()
        ? meta.name.trim()
        : typeof meta.fullName === 'string' && meta.fullName.trim()
          ? meta.fullName.trim()
          : null;

  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return;

  const { data: ws } = await supabaseAdmin
    .from('workspaces')
    .insert({ name: fullName || 'My Workspace' })
    .select('id')
    .single();

  if (!ws?.id) return;

  await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        workspace_id: ws.id,
        email: email ?? null,
        full_name: fullName ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );

  await supabaseAdmin
    .from('workspace_members')
    .upsert(
      { workspace_id: ws.id, user_id: userId, role: 'OWNER' },
      { onConflict: 'workspace_id,user_id', ignoreDuplicates: true },
    );

  const now = new Date();
  const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan: 'FREE',
        status: 'TRIAL',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
}
