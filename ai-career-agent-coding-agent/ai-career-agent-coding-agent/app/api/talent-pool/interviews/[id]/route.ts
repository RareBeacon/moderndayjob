import { NextResponse } from 'next/server';
import { z, type ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { interviewLifecycleActionSchema, interviewPrecheckSchema } from '@/lib/talent-pool/schemas';
import {
  completeInterviewPrecheck,
  getInterviewSessionDetail,
  handleInterviewLifecycleTransition,
} from '@/lib/talent-pool/interview-engine';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

const idSchema = z.guid();

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-int-get:${ip}`, 90, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  try {
    const detail = await getInterviewSessionDetail(user.id, id);
    return NextResponse.json(detail);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'SESSION_LOAD_FAILED' }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tp-int-patch:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    if ('camera_permission' in raw || 'microphone_permission' in raw) {
      const precheck = interviewPrecheckSchema.parse(raw);
      const out = await completeInterviewPrecheck(user.id, id, precheck);
      return NextResponse.json(out);
    }

    const lifecycle = interviewLifecycleActionSchema.parse(raw);
    const out = await handleInterviewLifecycleTransition(user.id, user.email, id, lifecycle.action, lifecycle.reason);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    if ((err as Error)?.message?.startsWith('INVALID_INTERVIEW_STATE_TRANSITION')) {
      return NextResponse.json({ error: 'INVALID_STATE_TRANSITION', message: (err as Error).message }, { status: 409 });
    }
    if ((err as ZodError)?.issues) {
      return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400 });
    }
    return NextResponse.json({ error: 'SESSION_UPDATE_FAILED' }, { status: 500 });
  }
}
