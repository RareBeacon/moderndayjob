import { runDailyPipeline } from '@/lib/agent/pipeline';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * Daily pipeline, the free production replacement for an always-on worker.
 * Triggered by Vercel Cron (see vercel.json) once a day; Vercel sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set.
 *
 * Runs: claim + drain due agent tasks (autopilot application submissions,
 * with every server-side gate re-checked inside the processor). Idempotent
 * by design (safe if Vercel double-fires or we invoke manually).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const rl = await enforceRateLimit(`cron:daily-pipeline:${requestIp(request)}`, 60, '1 m');
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
    const report = await runDailyPipeline();
    return Response.json(report);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'PIPELINE_FAILED';
    return Response.json({ error: 'PIPELINE_FAILED', detail }, { status: 500 });
  }
}
