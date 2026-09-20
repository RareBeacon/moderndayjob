import { requireUser } from '@/lib/auth';
import { AppActionError, getApplication } from '@/lib/applications/service';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/** Full application detail: row + job + prepared package + audit timeline. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`applications:id:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const user = await requireUser({ req: req });
    const { id } = await params;
    const detail = await getApplication(user.id, id);
    return Response.json(detail);
  } catch (error) {
    if (error instanceof AppActionError && error.code === 'NOT_FOUND') {
      return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'MFA_REQUIRED') {
      return Response.json({ error: 'MFA_REQUIRED' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('ACCOUNT_')) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
