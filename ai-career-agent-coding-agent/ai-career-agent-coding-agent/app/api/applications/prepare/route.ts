import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { AppActionError, prepareApplication } from '@/lib/applications/service';

const body = z.object({ jobId: z.string().uuid() });

function httpStatus(code: string): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'REQUIRED_FIELDS_MISSING': return 422;
    default: return 409; // EXPIRED_JOB, DUPLICATE, INVALID_TRANSITION
  }
}

/** Start the approval workflow for a job: creates a PREPARING application
 *  (idempotent) without consuming any automation quota. */
export async function POST(req: Request) {
  const user = await requireUser();
  const rl = await enforceRateLimit(`application:prepare:${requestIp(req)}:${user.id}`, 12, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });

  try {
    const detail = await prepareApplication(user.id, parsed.data.jobId, user.email);
    return Response.json({ application: detail }, { status: 201 });
  } catch (error) {
    if (error instanceof AppActionError) return Response.json({ error: error.code }, { status: httpStatus(error.code) });
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    throw error;
  }
}
