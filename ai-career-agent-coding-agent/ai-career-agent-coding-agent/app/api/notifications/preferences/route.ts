import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { z } from 'zod';

const preferencesSchema = z.object({
  applications: z.boolean().default(true),
  jobs: z.boolean().default(true),
  resume: z.boolean().default(true),
  autoApply: z.boolean().default(true),
  security: z.boolean().default(true),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    const rl = await enforceRateLimit(`notif-prefs:${requestIp(req)}:${user.id}`, 30, '1 m');
    if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('notification_preferences')
      .eq('user_id', user.id)
      .maybeSingle();

    const preferences = profile?.notification_preferences || {
      applications: true,
      jobs: true,
      resume: true,
      autoApply: true,
      security: true,
    };

    return NextResponse.json({ preferences });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', details: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    const rl = await enforceRateLimit(`notif-prefs:${requestIp(req)}:${user.id}`, 30, '1 m');
    if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const body = await req.json().catch(() => null);
    const parsed = preferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_PREFERENCES', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    await supabaseAdmin
      .from('profiles')
      .update({ notification_preferences: parsed.data })
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      preferences: parsed.data,
      message: 'Notification preferences updated successfully',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', details: message }, { status: 500 });
  }
}
