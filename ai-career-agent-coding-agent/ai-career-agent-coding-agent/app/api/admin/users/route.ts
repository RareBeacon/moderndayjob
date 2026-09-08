import { requireUser } from '../../../../lib/auth';
import { supabaseAdmin } from '../../../../lib/supabase';

/** Resolve the admin and reject non-admins with FORBIDDEN (403), matching the
 *  other admin routes. requireUser() throws 'UNAUTHENTICATED' when there is
 *  no session, which is intentionally left to propagate (existing pattern). */
async function admin() {
  const u = await requireUser();
  const { data: r } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', u.id).maybeSingle();
  if (!r) throw new Error('FORBIDDEN');
  return u;
}

/** List all users through the admin_user_overview security view (RLS-gated). */
export async function GET() {
  try {
    await admin();
    const { data } = await supabaseAdmin
      .from('admin_user_overview')
      .select('*')
      .order('created_at', { ascending: false });
    return Response.json(data ?? []);
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    throw error;
  }
}
