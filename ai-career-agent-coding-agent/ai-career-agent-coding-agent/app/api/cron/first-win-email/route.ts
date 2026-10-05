import { sendFirstWinEmails } from '@/lib/email/first-win';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * First-win activation nudge, triggered daily by Vercel Cron (see
 * vercel.json). Same contract as the other cron routes: Vercel sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is
 * set. Idempotent by design (set-once marker per account, safety cap per
 * run), so a double-fire or manual invocation is harmless.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const rl = await enforceRateLimit(`cron:first-win:${requestIp(request)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET_NOT_SET' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const report = await sendFirstWinEmails();
    return Response.json(report);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'FIRST_WIN_FAILED';
    return Response.json({ error: 'FIRST_WIN_FAILED', detail }, { status: 500 });
  }
}
