import crypto from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { onboardingGateResponse } from '@/lib/onboarding-gate';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent } from '@/lib/audit';
import { assertPublicHttpsUrl } from '@/lib/agent/egress';
import { AppActionError, prepareApplication } from '@/lib/applications/service';

const body = z.object({
  url: z.string().trim().url().max(2000),
  title: z.string().trim().min(2).max(160),
  company: z.string().trim().min(2).max(120),
  location: z.string().trim().max(160).optional(),
  description: z.string().trim().max(30000).optional(),
});

function httpStatus(code: string): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'REQUIRED_FIELDS_MISSING': return 422;
    default: return 409;
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser({ req: req });
    const onboardingBlocked = await onboardingGateResponse(user);
    if (onboardingBlocked) return onboardingBlocked;
    const rl = await enforceRateLimit(`application:target:${requestIp(req)}:${user.id}`, 12, '1 m');
    if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    const b = parsed.data;

    try {
      assertPublicHttpsUrl(b.url);
    } catch {
      return Response.json({ error: 'INVALID_JOB_URL' }, { status: 400 });
    }

    const external = crypto.createHash('sha256').update(`${user.id}:${b.url}`).digest('hex');
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .upsert(
        {
          source: 'MANUAL',
          external_id: external,
          company: b.company,
          title: b.title,
          url: b.url,
          location: b.location ?? null,
          description: b.description ?? null,
          metadata: { manual: true, origin: 'user' },
          created_at: new Date().toISOString(),
        },
        { onConflict: 'source,external_id' },
      )
      .select('id')
      .single();
    if (jobError || !job) return Response.json({ error: 'JOB_TARGET_FAILED' }, { status: 500 });

    void auditEvent({ action: 'JOB_TARGET_ADDED', resource: 'applications', userId: user.id, outcome: 'allow' });

    const detail = await prepareApplication(user.id, job.id, user.email);
    return Response.json({ application: detail.application, package: detail.package, timeline: detail.timeline, automationEnabled: detail.automationEnabled }, { status: 201 });
  } catch (error) {
    if (error instanceof AppActionError) return Response.json({ error: error.code }, { status: httpStatus(error.code) });
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    if (error instanceof Error && error.message === 'MFA_REQUIRED') return Response.json({ error: 'MFA_REQUIRED' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('ACCOUNT_')) return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
