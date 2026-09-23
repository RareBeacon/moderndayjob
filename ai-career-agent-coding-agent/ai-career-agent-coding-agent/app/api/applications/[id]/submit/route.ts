import { requireUser } from '@/lib/auth';
import { onboardingGateResponse } from '@/lib/onboarding-gate';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { AppActionError, submitApplication } from '@/lib/applications/service';

function httpStatus(code: string): number {
  return code === 'NOT_FOUND' ? 404 : 409;
}

/** Mark an APPROVED application as submitted (assisted handoff; Wave 3 sends
 *  nothing automatically; the user confirms and we record the timestamp). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser({ req: req });
    const onboardingBlocked = await onboardingGateResponse(user);
    if (onboardingBlocked) return onboardingBlocked;
    const rl = await enforceRateLimit(`application:submit:${requestIp(req)}:${user.id}`, 20, '1 m');
    if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const { id } = await params;
    const detail = await submitApplication(user.id, id);
    return Response.json({ application: detail });
  } catch (error) {
    if (error instanceof AppActionError) return Response.json({ error: error.code }, { status: httpStatus(error.code) });
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    if (error instanceof Error && error.message === 'MFA_REQUIRED') return Response.json({ error: 'MFA_REQUIRED' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('ACCOUNT_')) return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
