import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { AICredentialMissingError, buildGatewayForUser, createUsageMeter } from '@/lib/ai/server';
import { generateInterviewQuestions } from '@/lib/analysis/service';

const body = z.object({ jobDescription: z.string().min(30).max(30000) });

/**
 * POST /api/ai/interview-questions — free-tool interview practice generator.
 *
 * Questions are derived only from what the listing states. Costs one daily
 * AI credit, refunded when the provider fails. Public tool pages gate this
 * behind a free account.
 */
export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`ai:interviewq:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const { jobDescription } = parsed.data;

  const entitlement = await assertEntitlement(user.id, 'ai');
  if (Number(entitlement.ai_credits_remaining) <= 0) {
    return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
  }

  let gateway;
  try {
    gateway = await buildGatewayForUser(user.id);
  } catch (err) {
    if (err instanceof AICredentialMissingError) {
      return NextResponse.json({ error: 'AI_CREDENTIAL_NOT_CONFIGURED' }, { status: 503 });
    }
    throw err;
  }

  const meter = createUsageMeter(user.id);
  try {
    await meter.reserve();
  } catch (err) {
    if (err instanceof AIGatewayError && err.code === 'AI_QUOTA_EXHAUSTED') {
      return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
    }
    throw err;
  }

  try {
    const result = await generateInterviewQuestions({ gateway, jobDescription });
    return NextResponse.json({ result });
  } catch (err) {
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code }, { status: 502 });
    }
    throw err;
  }
}
