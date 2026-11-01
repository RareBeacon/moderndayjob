import { z } from 'zod';
import { requireAdminUser, adminErrorResponse, isPeerAdminTarget } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * Account termination. Admin-only, self- and peer-admin-protected, audited.
 * Marks profiles TERMINATED, cancels queued/running agent tasks, and revokes
 * live Supabase Auth sessions for every affected user.
 */
const bodySchema = z.object({
  userId: z.guid(),
  relatedUserIds: z.array(z.guid()).max(20).optional(),
});

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:users:terminate:${requestIp(req)}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser(req);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    const { userId, relatedUserIds = [] } = parsed.data;

    const targets = Array.from(new Set([userId, ...relatedUserIds]));
    if (targets.includes(admin.id)) {
      return Response.json({ error: 'CANNOT_TERMINATE_SELF' }, { status: 409 });
    }
    if (await isPeerAdminTarget(targets)) {
      return Response.json({ error: 'CANNOT_MODIFY_ADMIN_ACCOUNT' }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ account_status: 'TERMINATED' })
      .in('user_id', targets);
    if (error) return Response.json({ error: 'TERMINATE_FAILED' }, { status: 409 });

    await supabaseAdmin
      .from('agent_tasks')
      .update({ status: 'CANCELLED' })
      .in('user_id', targets)
      .in('status', ['PENDING', 'RUNNING']);

    await Promise.allSettled(
      targets.map((id) => supabaseAdmin.auth.admin.signOut(id, 'global')),
    );

    for (const id of targets) {
      await supabaseAdmin.from('admin_actions').insert({
        admin_user_id: admin.id,
        target_user_id: id,
        action: 'TERMINATE_ACCOUNT',
      });
    }

    return Response.json({ ok: true, terminated: targets });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
