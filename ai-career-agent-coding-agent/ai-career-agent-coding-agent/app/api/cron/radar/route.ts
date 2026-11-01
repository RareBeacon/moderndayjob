import { runAutonomousRadarCycle } from '@/lib/radar/pipeline/autonomous-orchestrator';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { timingSafeCronBearerMatch } from '@/lib/security/cron-auth';

/**
 * Scheduled Global Employment Intelligence Network cycle (`vercel.json`).
 * Protected by timing-safe CRON_SECRET bearer authentication + rate limiting.
 * Executes bounded discovery scouting, validated public ATS promotion,
 * multi-adapter polling, and deduplicated candidate opportunity alerts.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const rl = await enforceRateLimit(`cron:radar:${requestIp(request)}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET_NOT_SET' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  if (!timingSafeCronBearerMatch(auth, secret)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const report = await runAutonomousRadarCycle({
      maxAtsSources: 6,
      maxCareerPages: 2,
      enableNetworkScout: true,
    });
    return Response.json({ ok: true, ...report });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'RADAR_CRON_FAILED';
    return Response.json({ error: 'RADAR_CRON_FAILED', detail }, { status: 500 });
  }
}
