import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { AppActionError, rejectApplication } from '@/lib/applications/service';

const body = z.object({ reason: z.string().trim().max(500).optional() });

function httpStatus(code: string): number {
  return code === 'NOT_FOUND' ? 404 : 409;
}

/** Reject an application that is awaiting approval. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser({ req: req });
    const rl = await enforceRateLimit(`application:reject:${requestIp(req)}:${user.id}`, 20, '1 m');
    if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const { id } = await params;
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    const detail = await rejectApplication(user.id, id, parsed.success ? parsed.data.reason : undefined);
    return Response.json({ application: detail });
  } catch (error) {
    if (error instanceof AppActionError) return Response.json({ error: error.code }, { status: httpStatus(error.code) });
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    if (error instanceof Error && error.message === 'MFA_REQUIRED') return Response.json({ error: 'MFA_REQUIRED' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('ACCOUNT_')) return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
