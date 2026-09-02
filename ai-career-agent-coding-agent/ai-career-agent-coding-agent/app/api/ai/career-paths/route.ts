import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { AICredentialMissingError, buildGatewayForUser, createUsageMeter } from '@/lib/ai/server';
import { generateCareerPaths } from '@/lib/analysis/service';
import { loadGenerationProfile } from '@/lib/generation/loader';

/**
 * POST /api/ai/career-paths — exploratory direction suggestions from
 * verified skills. Deterministic guard: skills cited as "building on" must
 * exist in the profile or the draft is rejected + refunded.
 */
export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`ai:careerpaths:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

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
    const result = await generateCareerPaths({ gateway, profile });
    if (!result.verified) {
      await meter.refund();
      return NextResponse.json(
        { error: 'TRUTHFULNESS_FAILED', summary: `The draft cited skills not in your profile: ${result.unsupportedSkills.slice(0, 5).join(', ')}.` },
        { status: 422 },
      );
    }
    return NextResponse.json({
      paths: result.paths,
      summary: result.summary,
      provider: result.provider,
      framing: 'Exploratory suggestions based on your verified skills — not guaranteed outcomes.',
    });
  } catch (err) {
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code }, { status: 502 });
    }
    throw err;
  }
}
