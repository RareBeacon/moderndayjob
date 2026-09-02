import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { AICredentialMissingError, buildGatewayForUser, createUsageMeter } from '@/lib/ai/server';
import { generateProfileCopy } from '@/lib/analysis/service';
import { loadGenerationProfile } from '@/lib/generation/loader';

const body = z.object({ kind: z.enum(['SUMMARY', 'HEADLINE']) });

/**
 * POST /api/ai/profile-copy, free-tool resume summaries & LinkedIn headlines.
 *
 * Options are generated ONLY from the user's verified profile facts and then
 * checked by the deterministic truthfulness checker; a failed check rejects
 * the output and refunds the credit (same contract as document generation).
 */
export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`ai:profilecopy:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const { kind } = parsed.data;

  const entitlement = await assertEntitlement(user.id, 'ai');
  if (Number(entitlement.ai_credits_remaining) <= 0) {
    return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
  }

  const profile = await loadGenerationProfile(user.id);
  if (!profile) {
    return NextResponse.json({ error: 'CAREER_PROFILE_REQUIRED' }, { status: 400 });
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
    const result = await generateProfileCopy({ gateway, kind, profile });
    if (!result.report.passed) {
      // Unsupported claims, reject and refund, exactly like document generation.
      await meter.refund();
      return NextResponse.json(
        { error: 'TRUTHFULNESS_FAILED', summary: result.report.summary },
        { status: 422 },
      );
    }
    return NextResponse.json({
      kind: result.kind,
      options: result.options,
      report: { passed: result.report.passed, summary: result.report.summary },
      provider: result.provider,
    });
  } catch (err) {
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code }, { status: 502 });
    }
    throw err;
  }
}
