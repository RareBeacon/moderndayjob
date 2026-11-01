import { z } from 'zod';
import { requireAdminUser, adminErrorResponse, isPeerAdminTarget } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/** Reversible pause: account_status -> SUSPENDED, queued work cancelled, live
 *  sessions revoked. Self- and peer-admin-protected. */
const bodySchema = z.object({ userId: z.guid() });

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:users:suspend:${requestIp(req)}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser(req);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    const { userId } = parsed.data;
    if (userId === admin.id) {
      return Response.json({ error: 'CANNOT_SUSPEND_SELF' }, { status: 409 });
    }
    if (await isPeerAdminTarget([userId])) {
      return Response.json({ error: 'CANNOT_MODIFY_ADMIN_ACCOUNT' }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ account_status: 'SUSPENDED' })
      .eq('user_id', userId);
    if (error) return Response.json({ error: 'SUSPEND_FAILED' }, { status: 409 });

    await supabaseAdmin
      .from('agent_tasks')
      .update({ status: 'CANCELLED' })
      .eq('user_id', userId)
      .in('status', ['PENDING', 'RUNNING']);

    await supabaseAdmin.auth.admin.signOut(userId, 'global').catch(() => {});

    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: userId,
      action: 'SUSPEND_ACCOUNT',
    });

    return Response.json({ ok: true, suspended: userId });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
