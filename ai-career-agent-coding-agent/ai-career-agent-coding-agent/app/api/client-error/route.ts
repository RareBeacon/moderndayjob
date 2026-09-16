import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { auditEvent } from '@/lib/audit';

/**
 * POST /api/client-error - lightweight client-side error monitoring
 * (Phase 10). The Next.js error boundary reports unhandled client errors
 * here; they land in audit_logs (action CLIENT_ERROR) where admins can see
 * them. Best-effort: unauthenticated-safe (errors can happen pre-login),
 * strictly rate-limited, no stack-trace PII beyond a bounded tail.
 */

const body = z.object({
  message: z.string().min(1).max(500),
  digest: z.string().max(120).optional(),
  path: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`client-error:${requestIp(req)}`, 10, '1 h');
  if (!rl.allowed) return NextResponse.json({ ok: true }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: true }, { status: 400 });
  const { message, digest, path } = parsed.data;

  void auditEvent({
    action: 'CLIENT_ERROR',
    resource: 'client',
    outcome: 'error',
    meta: {
      message: message.slice(0, 400),
      digest: digest ?? null,
      path: path?.slice(0, 200) ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
