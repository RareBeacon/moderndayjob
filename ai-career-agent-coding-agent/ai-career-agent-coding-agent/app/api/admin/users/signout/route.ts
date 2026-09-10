import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

/* Admin-only "sign out everywhere": revokes every live session for the target
 * user via Supabase Auth admin. Combined with suspend/terminate this closes
 * the "revoke-sessions" promise from SECURITY_ARCHITECTURE. */
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
    const { error } = await supabaseAdmin.auth.admin.signOut(userId, 'global');
    if (error) return Response.json({ error: error.message }, { status: 409 });

    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: userId,
      action: 'REVOKE_SESSIONS',
    });
    return Response.json({ ok: true, signedOut: userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL';
    if (message === 'FORBIDDEN') return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    if (error instanceof z.ZodError) return Response.json({ error: 'BAD_REQUEST' }, { status: 400 });
    return Response.json({ error: message }, { status: 409 });
  }
}
