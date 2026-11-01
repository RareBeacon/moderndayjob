import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/** Server-side admin check backed by the admin_users table (no env email lists). */
export async function requireAdminUser(req?: Request) {
  const user = await requireUser(req ? { req } : undefined);
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) throw new Error('FORBIDDEN');
  return user;
}

/** Check whether any user id in `targetIds` belongs to `admin_users`.
 *  Verifies the returned `user_id` actually matches one of `targetIds` so
 *  shared unit-test mocks remain deterministic while real peer-admins are
 *  always protected from lateral lockout. */
export async function isPeerAdminTarget(targetIds: string[]): Promise<boolean> {
  const clean = Array.from(new Set(targetIds.filter(Boolean)));
  if (clean.length === 0) return false;
  for (const targetId of clean) {
    const { data } = await supabaseAdmin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', targetId)
      .maybeSingle();
    if (data && (data as { user_id?: string }).user_id === targetId) {
      return true;
    }
  }
  return false;
}

export function adminErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'UNAUTHENTICATED' ||
    message === 'MFA_REQUIRED' ||
    message.startsWith('SESSION_')
  ) {
    return Response.json({ error: message || 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (
    message === 'FORBIDDEN' ||
    message.startsWith('ACCOUNT_')
  ) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (
    message === 'GOOGLE_OAUTH_CODE_OR_STATE_MISSING' ||
    message === 'GOOGLE_OAUTH_STATE_INVALID'
  ) {
    return Response.json({ error: message }, { status: 400 });
  }
  // Never echo raw database, stack, or driver error strings to HTTP clients.
  return Response.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
}
