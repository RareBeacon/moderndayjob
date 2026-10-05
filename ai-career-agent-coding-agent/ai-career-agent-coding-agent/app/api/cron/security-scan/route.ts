import { runSelfScan } from '@/lib/security/self-scan';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { logSecuritySignal } from '@/lib/security/abuse';

/**
 * Weekly self security scan, the live version of the 2026-10-05 manual
 * attack suite (owner brief: automated scanning). Vercel Cron calls this
 * with `Authorization: Bearer $CRON_SECRET` (schedule in vercel.json).
 * Failures raise a SECURITY_SCAN_FINDING signal so the daily security
 * digest surfaces them; the full report is returned in the response.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const rl = await enforceRateLimit(`cron:security-scan:${requestIp(request)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'CRON_SECRET_NOT_SET' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const origin = new URL(request.url).origin;
    const report = await runSelfScan(origin);
    if (report.findings.length > 0) {
      void logSecuritySignal(
        'SECURITY_SCAN_FINDING',
        'WARN',
        { findings: report.findings.map((f) => ({ name: f.name, detail: f.detail })) },
      );
    }
    return Response.json(report);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'SCAN_FAILED';
    void logSecuritySignal('SECURITY_SCAN_ERROR', 'WARN', { detail: detail.slice(0, 200) });
    return Response.json({ error: 'SCAN_FAILED' }, { status: 500 });
  }
}
