import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { createToolMeter } from '@/lib/ai/server';
import { analyzeJob } from '@/lib/analysis/service';
import { supabaseAdmin } from '@/lib/supabase';

const body = z.object({ jobDescription: z.string().min(30).max(30000) });

export const maxDuration = 300;

/**
 * POST /api/ai/analyze-job, free-tool job-description analysis.
 *
 * Deterministically extracts what the listing states (skills, keywords,
 * responsibilities), then compares required skills against the user's profile
 * skills. Costs one daily free-tool use. Public tool pages gate this behind a
 * free account.
 */
export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`ai:analyze:${requestIp(req)}:${user.id}`, 10, '1 m');
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

  // Profile skills are optional, analysis still works without a profile;
  // the client then shows neutral chips instead of matched/missing.
  const { data: career } = await supabaseAdmin
    .from('career_profiles')
    .select('skills')
    .eq('user_id', user.id)
    .maybeSingle();
  const userSkills = Array.isArray(career?.skills) ? (career.skills as string[]) : [];


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
    const analysis = await analyzeJob({ jobDescription, userSkills, deterministicOnly: true });
    return NextResponse.json({ analysis, profileSkillsCount: userSkills.length });
  } catch (err) {
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code, detail: String(err.message ?? '').slice(0, 500) }, { status: 502 });
    }
    throw err;
  }
}
