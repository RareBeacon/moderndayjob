import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import {
  AICredentialMissingError,
  buildGatewayForUser,
  createUsageMeter,
} from '@/lib/ai/server';
import { generateDocument } from '@/lib/generation/service';
import { persistGeneratedDocument } from '@/lib/generation/persist';
import { loadGenerationJob, loadGenerationProfile } from '@/lib/generation/loader';

const body = z.object({
  kind: z.enum(['CV', 'COVER_LETTER', 'ANSWERS']),
  jobId: z.string().uuid().optional(),
  applicationId: z.string().uuid().nullable().optional(),
  questions: z.array(z.string().trim().min(1).max(1000)).min(1).max(20).optional(),
});

/**
 * POST /api/documents/generate, Phase 7 application intelligence.
 *
 * Generates a CV / cover letter / application answers using ONLY profile facts,
 * runs the deterministic truthfulness checker, and, only if it passes, stores
 * the result as an immutable, versioned generated_documents row. Costs one daily
 * AI credit, refunded when the AI fails or the output is rejected for
 * unsupported facts.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const rl = await enforceRateLimit(`ai:gen:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const { kind, jobId, applicationId, questions } = parsed.data;
  if (kind === 'ANSWERS' && (!questions || questions.length === 0)) {
    return NextResponse.json({ error: 'ANSWERS_REQUIRES_QUESTIONS' }, { status: 400 });
  }

  const entitlement = await assertEntitlement(user.id, 'ai');
  if (Number(entitlement.ai_credits_remaining) <= 0) {
    return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
  }

  const profile = await loadGenerationProfile(user.id);
  if (!profile) return NextResponse.json({ error: 'CAREER_PROFILE_REQUIRED' }, { status: 400 });

  let job = undefined;
  if (jobId) {
    job = await loadGenerationJob(jobId);
    if (!job) return NextResponse.json({ error: 'JOB_NOT_FOUND' }, { status: 404 });
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

  let result;
  try {
    result = await generateDocument({ kind, profile, job, questions, gateway });
  } catch (err) {
    // Provider failure (or no providers), refund and surface as upstream error.
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code }, { status: 502 });
    }
    throw err;
  }

  // Truthfulness gate: reject unsupported facts. Do not persist; refund.
  if (!result.report.passed) {
    await meter.refund();
    return NextResponse.json(
      { error: 'TRUTHFULNESS_FAILED', report: result.report, draft: result.content },
      { status: 422 },
    );
  }

  const persisted = await persistGeneratedDocument({
    userId: user.id,
    applicationId: applicationId ?? null,
    kind: result.kind,
    title: result.title,
    content: result.content,
    report: result.report,
    provider: result.provider,
  });

  return NextResponse.json(
    { document: { id: persisted.id, version: persisted.version, contentHash: persisted.contentHash, kind, title: result.title, content: result.content }, report: result.report },
    { status: 201 },
  );
}
