import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { onboardingGateResponse } from '@/lib/onboarding-gate';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

const body = z.object({ application_mode: z.enum(['auto', 'approval']) });

/**
 * POST /api/preferences/mode; turn the user's automatic submission on or
 * off. Writes job_preferences.application_mode: 'auto' lets the agent send
 * eligible applications within the user's rules, 'approval' (the default)
 * waits for a human approval on every application. The upsert sends only
 * this column, so the rest of the row keeps its values; and the send path
 * re-checks everything server-side anyway (global kill switch, per-user
 * pause, plan entitlement, adapter support, truthfulness), so this toggle
 * only ever expresses the user's choice.
 */
export async function POST(req: Request) {
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const onboardingBlocked = await onboardingGateResponse(user);
    if (onboardingBlocked) return onboardingBlocked;
  const rl = await enforceRateLimit(`preferences:mode:${requestIp(req)}:${user.id}`, 20, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });

  const { error } = await supabaseAdmin.from('job_preferences').upsert(
    { user_id: user.id, application_mode: parsed.data.application_mode, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) return Response.json({ error: 'PREFERENCES_UPDATE_FAILED' }, { status: 500 });
  return Response.json({ ok: true, application_mode: parsed.data.application_mode });
}
