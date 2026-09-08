import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { AppActionError, submitApplication } from '@/lib/applications/service';

function httpStatus(code: string): number {
  return code === 'NOT_FOUND' ? 404 : 409;
}

/** Mark an APPROVED application as submitted (assisted handoff — Wave 3 sends
 *  nothing automatically; the user confirms and we record the timestamp). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const rl = await enforceRateLimit(`application:submit:${requestIp(req)}:${user.id}`, 20, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const { id } = await params;
  try {
    const detail = await submitApplication(user.id, id);
    return Response.json({ application: detail });
  } catch (error) {
    if (error instanceof AppActionError) return Response.json({ error: error.code }, { status: httpStatus(error.code) });
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    throw error;
  }
}
