import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/** Shared server-only admin gate for admin pages and API routes. */
export async function requireAdminUser() {
  const user = await requireUser().catch(() => null);
  if (!user) throw new Error('UNAUTHENTICATED');
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) throw new Error('FORBIDDEN');
  return user;
}

export function adminErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'INTERNAL';
  if (message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (message === 'FORBIDDEN') return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  return Response.json({ error: message }, { status: 500 });
}
