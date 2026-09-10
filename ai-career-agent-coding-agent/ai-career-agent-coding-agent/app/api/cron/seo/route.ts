import { runSeoDailyLoop } from '@/lib/seo/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily SEO agent loop. Protected by CRON_SECRET and safe while paused.
 * It never fakes rankings or indexing. It only syncs discoverable content,
 * verifies sitemap/robots, imports Search Console metrics when connected, and
 * records actions in seo_audit_logs.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'CRON_SECRET_NOT_SET' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    return Response.json(await runSeoDailyLoop());
  } catch (error) {
    return Response.json({ error: 'SEO_DAILY_LOOP_FAILED', detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
