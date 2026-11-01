import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

const MAX_OVERVIEW_ROWS = 1000;

/** List users through the email-free `admin_user_overview` security view.
 *  Bounded to `MAX_OVERVIEW_ROWS` and never returns raw internal DB errors. */
export async function GET(req: Request) {
  const rl = await enforceRateLimit(`admin:users:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    await requireAdminUser(req);
    const ordered = supabaseAdmin
      .from('admin_user_overview')
      .select('*')
      .order('created_at', { ascending: false });
    const { data, error } =
      typeof (ordered as unknown as { limit?: unknown }).limit === 'function'
        ? await ordered.limit(MAX_OVERVIEW_ROWS)
        : await ordered;
    if (error) {
      return Response.json({ error: 'ADMIN_USERS_LOAD_FAILED' }, { status: 500 });
    }
    return Response.json((data ?? []).slice(0, MAX_OVERVIEW_ROWS));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
