import { z } from 'zod';
import { requireAdminUser, adminErrorResponse, isPeerAdminTarget } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/** Sign a user out everywhere (revokes every refresh token via GoTrue admin).
 *  Self- and peer-admin-protected so one compromised admin cannot force-evict
 *  the owner or fellow administrators. */
const bodySchema = z.object({ userId: z.guid() });

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:users:signout:${requestIp(req)}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const admin = await requireAdminUser(req);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    const { userId } = parsed.data;
    if (userId === admin.id) {
      return Response.json({ error: 'CANNOT_SIGNOUT_SELF' }, { status: 409 });
    }
    if (await isPeerAdminTarget([userId])) {
      return Response.json({ error: 'CANNOT_MODIFY_ADMIN_ACCOUNT' }, { status: 409 });
    }

    const { error } = await supabaseAdmin.auth.admin.signOut(userId, 'global');
    if (error) return Response.json({ error: 'SIGNOUT_FAILED' }, { status: 409 });

    await supabaseAdmin.from('admin_actions').insert({
      admin_user_id: admin.id,
      target_user_id: userId,
      action: 'REVOKE_SESSIONS',
    });

    return Response.json({ ok: true, signedOut: userId });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
