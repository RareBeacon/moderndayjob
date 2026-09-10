import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

/* Admin-only account suspension. Mirrors terminate: sets the profile status,
 * cancels any queued/running agent work, and writes an audited admin action.
 * Suspended accounts are rejected by requireUser() on the next request. */
const body = z.object({ userId: z.string().uuid() });

export async function POST(req: Request) {
  try {
    const admin = await requireUser().catch(() => null);
    if (!admin) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const { data: a } = await supabaseAdmin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', admin.id)
      .maybeSingle();
    if (!a) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

    const { userId } = body.parse(await req.json());
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ account_status: 'SUSPENDED' })
      .eq('user_id', userId);
    if (error) return Response.json({ error: error.message }, { status: 409 });

    // Revoke live sessions so the suspension takes effect immediately.
    await supabaseAdmin.auth.admin.signOut(userId, 'global').catch(() => undefined);

    await supabaseAdmin
      .from('agent_tasks')
      .update({ status: 'CANCELLED' })
      .eq('user_id', userId)
      .in('status', ['QUEUED', 'RUNNING']);

    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: userId,
      action: 'SUSPEND_ACCOUNT',
    });
    return Response.json({ ok: true, suspended: userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL';
    if (message === 'FORBIDDEN') return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    if (error instanceof z.ZodError) return Response.json({ error: 'BAD_REQUEST' }, { status: 400 });
    return Response.json({ error: message }, { status: 409 });
  }
}
