import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

/* Admin-only account termination: sets TERMINATED, cancels queued/running
 * agent work, revokes live sessions, and writes an audited admin action. */
const body = z.object({ userId: z.string().uuid(), relatedUserIds: z.array(z.string().uuid()).default([]) });

export async function POST(req: Request) {
  try {
    const admin = await requireUser();
    const { data: a } = await supabaseAdmin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', admin.id)
      .maybeSingle();
    if (!a) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

    const b = body.parse(await req.json());
    const ids = [b.userId, ...b.relatedUserIds];

    await supabaseAdmin.from('profiles').update({ account_status: 'TERMINATED' }).in('user_id', ids);
    await supabaseAdmin
      .from('agent_tasks')
      .update({ status: 'CANCELLED' })
      .in('user_id', ids)
      .in('status', ['QUEUED', 'RUNNING']);

    // Revoke every live session so termination takes effect immediately.
    for (const id of ids) {
      await supabaseAdmin.auth.admin.signOut(id, 'global').catch(() => undefined);
      await supabaseAdmin.from('admin_actions').insert({
        admin_user_id: admin.id,
        target_user_id: id,
        action: 'TERMINATE_ACCOUNT',
      });
    }

    return Response.json({ ok: true, terminated: ids });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL';
    if (message === 'FORBIDDEN') return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    if (error instanceof z.ZodError) return Response.json({ error: 'BAD_REQUEST' }, { status: 400 });
    return Response.json({ error: message }, { status: 409 });
  }
}
