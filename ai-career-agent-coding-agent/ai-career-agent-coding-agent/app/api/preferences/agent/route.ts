import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

const body = z.object({ active: z.boolean() });

/**
 * POST /api/preferences/agent — pause or resume the user's automation agent.
 * Writes job_preferences.active (the per-user kill switch). The agent worker
 * re-checks this server-side before any automatic submission.
 */
export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rl = await enforceRateLimit(`preferences:agent:${requestIp(req)}:${user.id}`, 20, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });

  const { error } = await supabaseAdmin.from('job_preferences').upsert(
    { user_id: user.id, active: parsed.data.active, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) return Response.json({ error: 'PREFERENCES_UPDATE_FAILED' }, { status: 500 });
  return Response.json({ ok: true, active: parsed.data.active });
}
