import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { AppActionError, approveApplication } from '@/lib/applications/service';

function httpStatus(code: string): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'REQUIRED_FIELDS_MISSING': return 422;
    default: return 409;
  }
}

/** Approve an application that is awaiting approval (gated server-side). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser({ req: req });
    const rl = await enforceRateLimit(`application:approve:${requestIp(req)}:${user.id}`, 20, '1 m');
    if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const { id } = await params;
    const detail = await approveApplication(user.id, id);
    return Response.json({ application: detail });
  } catch (error) {
    if (error instanceof AppActionError) return Response.json({ error: error.code }, { status: httpStatus(error.code) });
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    if (error instanceof Error && error.message === 'MFA_REQUIRED') return Response.json({ error: 'MFA_REQUIRED' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('ACCOUNT_')) return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
