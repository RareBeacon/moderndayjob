import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { sendPushNotification } from '@/lib/push-notifications';
import { z } from 'zod';

const testNotificationSchema = z.object({
  type: z.enum(['application', 'job_match', 'resume', 'auto_apply', 'security']).default('job_match'),
  customMessage: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    const rl = await enforceRateLimit(`notif-test:${requestIp(req)}:${user.id}`, 5, '1 h');
    if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const parsed = testNotificationSchema.safeParse(body);
    const type = parsed.success ? parsed.data.type : 'job_match';

    let title = 'Jobiest AI Career Agent';
    let message = 'Your career agent found 3 high-match roles for your profile!';
    let deepLink = 'jobiest://applications';

    switch (type) {
      case 'application':
        title = 'Application Update';
        message = 'Your application for Senior Product Designer at Airbnb is ready for review.';
        deepLink = 'jobiest://applications';
        break;
      case 'job_match':
        title = 'New 94% Match Found';
        message = 'Airbnb: Senior Product Designer in San Francisco matches your UX systems craft.';
        deepLink = 'jobiest://jobs';
        break;
      case 'resume':
        title = 'Resume Studio';
        message = 'AI keyword analysis complete: 8 high-signal terms surfaced for your resume.';
        deepLink = 'jobiest://resume';
        break;
      case 'auto_apply':
        title = 'Auto-Apply Status';
        message = 'Your delegated AI agent successfully prepared an application draft.';
        deepLink = 'jobiest://applications';
        break;
      case 'security':
        title = 'Security Alert';
        message = 'New Android device registered for push notifications.';
        deepLink = 'jobiest://profile';
        break;
    }

    if (parsed.success && parsed.data.customMessage) {
      message = parsed.data.customMessage;
    }

    const result = await sendPushNotification(user.id, {
      title,
      body: message,
      deepLink,
      type,
    });

    return NextResponse.json({
      ok: true,
      deliveredTo: result.recipientCount,
      notification: {
        title,
        body: message,
        deepLink,
        type,
        sentAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', details: message }, { status: 500 });
  }
}
