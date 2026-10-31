import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';
import { CORRELATION_HEADER, logServerEvent, resolveRequestId } from '@/lib/observability';

/**
 * POST /api/client-error - lightweight client-side error monitoring
 * (Phase 10). The Next.js error boundary reports unhandled client errors
 * here; they land in audit_logs (action CLIENT_ERROR) with a correlation
 * request_id so admins can trace them. Best-effort: unauthenticated-safe
 * (errors can happen pre-login), strictly rate-limited, no stack-trace PII.
 */

const body = z.object({
  message: z.string().min(1).max(500),
  digest: z.string().max(120).optional(),
  path: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const requestId = resolveRequestId(req);
  const rl = await enforceRateLimit(`client-error:${requestIp(req)}`, 10, '1 h');
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: true, requestId },
      { status: 429, headers: { [CORRELATION_HEADER]: requestId } },
    );
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: true, requestId },
      { status: 400, headers: { [CORRELATION_HEADER]: requestId } },
    );
  }
  const { message, digest, path } = parsed.data;

  logServerEvent('warn', 'client.error_boundary', {
    requestId,
    route: path ?? '/api/client-error',
    meta: { message: message.slice(0, 400), digest: digest ?? null },
  });

  void auditEvent({
    action: 'CLIENT_ERROR',
    resource: 'client',
    outcome: 'error',
    requestId,
    meta: {
      message: message.slice(0, 400),
      digest: digest ?? null,
      path: path?.slice(0, 200) ?? null,
    },
  });

  return NextResponse.json(
    { ok: true, requestId },
    { headers: { [CORRELATION_HEADER]: requestId } },
  );
}
