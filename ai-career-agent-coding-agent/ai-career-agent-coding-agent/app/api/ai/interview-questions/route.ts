import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { createToolMeter } from '@/lib/ai/server';
import { generateInterviewQuestions } from '@/lib/analysis/service';

const body = z.object({ jobDescription: z.string().min(30).max(30000) });

export const maxDuration = 300;

/**
 * POST /api/ai/interview-questions, free-tool interview practice generator.
 *
 * Questions are derived only from what the listing states. Costs one daily
 * free-tool use. Public tool pages gate this behind a free account.
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
  const toolsLeft = entitlement.tool_uses_remaining;
  if (toolsLeft !== null && Number(toolsLeft) <= 0) {
    return NextResponse.json({ error: 'DAILY_TOOL_USES_EXHAUSTED' }, { status: 429 });
  }


  const meter = createToolMeter(user.id);
  try {
    await meter.reserve();
  } catch (err) {
    if (err instanceof AIGatewayError && err.code === 'TOOL_QUOTA_EXHAUSTED') {
      return NextResponse.json({ error: 'DAILY_TOOL_USES_EXHAUSTED' }, { status: 429 });
    }
    throw err;
  }

  try {
    const result = await generateInterviewQuestions({ jobDescription, deterministicOnly: true });
    return NextResponse.json({ result });
  } catch (err) {
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code, detail: String(err.message ?? '').slice(0, 500) }, { status: 502 });
    }
    throw err;
  }
}
