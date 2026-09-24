import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { unregisterPushToken } from '@/lib/push-notifications';
import { z } from 'zod';

const unregisterSchema = z.object({
  token: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = unregisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    await unregisterPushToken(user.id, parsed.data.token);

    return NextResponse.json({
      ok: true,
      message: 'Device push token unregistered successfully',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', details: message }, { status: 500 });
  }
}
