import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { registerPushToken } from '@/lib/push-notifications';
import { z } from 'zod';

const registerTokenSchema = z.object({
  token: z.string().min(10, 'Push token too short'),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
  deviceModel: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    const rl = await enforceRateLimit(`notif-register:${requestIp(req)}:${user.id}`, 10, '1 h');
    if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const body = await req.json().catch(() => null);
    const parsed = registerTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await registerPushToken(
      user.id,
      parsed.data.token,
      parsed.data.platform,
      parsed.data.deviceModel
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: 'TOKEN_REGISTRATION_FAILED', details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Device push token registered successfully',
      registeredAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', details: message }, { status: 500 });
  }
}
