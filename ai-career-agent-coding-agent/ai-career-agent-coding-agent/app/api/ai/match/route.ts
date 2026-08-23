import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AICredentialMissingError, buildGatewayForUser, createUsageMeter } from '@/lib/ai/server';
import { loadMatchInputs } from '@/lib/ai/matching-loader';
import { runMatching } from '@/lib/matching/engine';
import { AIGatewayError } from '@packages/ai/gateway';

const body = z.object({
  threshold: z.number().int().min(0).max(100).optional(),
  maxScored: z.number().int().min(1).max(20).optional(),
});

/**
 * POST /api/ai/match — Phase 6 matching.
 *
 * Scores the user's job pool against their profile with explainable results,
 * excluding already-applied jobs and preference mismatches deterministically.
 * Costs exactly one daily AI credit per session (refunded only if every job's
 * AI scoring fails).
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const rl = await enforceRateLimit(`ai:match:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  // Entitlement + hard pre-check on remaining credits (backstop before the
  // atomic RPC reserve, for a clean 429 without a DB write).
  const entitlement = await assertEntitlement(user.id, 'ai');
  if (Number(entitlement.ai_credits_remaining) <= 0) {
    return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
  }

  const { profile, prefs, jobs, appliedJobIds } = await loadMatchInputs(user.id);
  if (!profile) {
    return NextResponse.json({ error: 'CAREER_PROFILE_REQUIRED' }, { status: 400 });
  }
  if (jobs.length === 0) {
    return NextResponse.json({ matches: [], excludedCount: 0, cappedCount: 0, scoredCount: 0, failures: [] });
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

  // Session-level metering: one credit reserves the whole match session.
  const meter = createUsageMeter(user.id);
  try {
    await meter.reserve();
  } catch (err) {
    if (err instanceof AIGatewayError && err.code === 'AI_QUOTA_EXHAUSTED') {
      return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
    }
    throw err;
  }

  const outcome = await runMatching({
    jobs,
    profile,
    prefs,
    appliedJobIds,
    gateway,
    options: { threshold: parsed.data.threshold, maxScored: parsed.data.maxScored },
  });

  // Total AI failure: nothing useful produced. Refund the credit.
  if (outcome.scoredCount > 0 && outcome.failures.length === outcome.scoredCount) {
    await meter.refund();
    return NextResponse.json(
      { error: 'AI_MATCH_FAILED', failures: outcome.failures },
      { status: 502 },
    );
  }

  return NextResponse.json(outcome);
}
