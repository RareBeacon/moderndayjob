import { runSecurityDigest } from '@/lib/security/digest';

/**
 * Daily security digest email (SECURITY_AUDIT §20.3). Triggered by Vercel
 * Cron (see vercel.json); Vercel sends `Authorization: Bearer $CRON_SECRET`
 * automatically when CRON_SECRET is set. Same auth pattern as
 * /api/cron/daily-pipeline. Skips gracefully when ADMIN_ALERT_EMAIL is unset.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET_NOT_SET' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const report = await runSecurityDigest();
  return Response.json(report);
}
