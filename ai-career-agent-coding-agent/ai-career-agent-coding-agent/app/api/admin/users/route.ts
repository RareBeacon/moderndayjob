import { requireUser } from '../../../../lib/auth';
import { supabaseAdmin } from '../../../../lib/supabase';
import { enforceRateLimit, requestIp } from '../../../../lib/rate-limit';

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
export async function GET(req: Request) {
  const rl = await enforceRateLimit(`admin:users:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

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
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'MFA_REQUIRED') {
      return Response.json({ error: 'MFA_REQUIRED' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('ACCOUNT_')) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
