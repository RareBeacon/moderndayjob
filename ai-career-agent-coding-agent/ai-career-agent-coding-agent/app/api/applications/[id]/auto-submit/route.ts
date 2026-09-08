import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { AppActionError, requestAutoSubmit } from '@/lib/applications/service';

function httpStatus(code: string): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'NOT_ENTITLED':
      return 403;
    case 'INVALID_TRANSITION':
    case 'AUTOMATION_DISABLED':
    case 'UNSUPPORTED_PLATFORM':
    case 'DUPLICATE':
      return 409;
    default:
      return 409;
  }
}

/**
 * POST /api/applications/[id]/auto-submit — enqueue a controlled automatic
 * submission for an APPROVED application. Server-side gates only (the browser
 * is never trusted): approved state, global kill switch, automation
 * entitlement, supported site adapter. Idempotent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const rl = await enforceRateLimit(`application:autosubmit:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const { id } = await params;
  try {
    const { taskId } = await requestAutoSubmit(user.id, id);
    return Response.json({ taskId, status: 'QUEUED' }, { status: 202 });
  } catch (error) {
    if (error instanceof AppActionError) {
      return Response.json({ error: error.code, message: error.message }, { status: httpStatus(error.code) });
    }
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    throw error;
  }
}
