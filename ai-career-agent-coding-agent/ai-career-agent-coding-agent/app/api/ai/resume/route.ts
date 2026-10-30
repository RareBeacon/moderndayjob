import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { buildGatewayForUser, createUsageMeter } from '@/lib/ai/server';
import { auditEvent } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase';
import { generateDocument } from '@/lib/generation/service';
import type { GenerationProfile } from '@/lib/generation/types';
import { recordGenerationUsage } from '@/lib/ai/usage';

const body = z.object({
  jobDescription: z.string().min(30).max(30000),
  provider: z.enum(['openrouter', 'huggingface']).optional(),
  model: z.string().min(1).max(200).optional(),
});

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`ai:resume:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const entitlement = await assertEntitlement(user.id, 'ai');
  if (Number(entitlement.ai_credits_remaining) <= 0) {
    return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
  }

  const [{ data: career }, { data: profileRow }] = await Promise.all([
    supabaseAdmin
      .from('career_profiles')
      .select('headline, summary, skills, experience, education')
      .eq('user_id', user.id)
      .single(),
    supabaseAdmin.from('profiles').select('target_roles').eq('user_id', user.id).single(),
  ]);
  if (!career) return NextResponse.json({ error: 'CAREER_PROFILE_REQUIRED' }, { status: 400 });

  const resumeT0 = Date.now();
  const meter = createUsageMeter(user.id);
  try {
    await meter.reserve();
  } catch (err) {
    if (err instanceof AIGatewayError && err.code === 'AI_QUOTA_EXHAUSTED') {
      void recordGenerationUsage({ userId: user.id, feature: 'ai.resume', provider: 'none', latencyMs: Date.now() - resumeT0, status: 'blocked', errorCode: 'AI_QUOTA_EXHAUSTED' });
      return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
    }
    throw err;
  }

  const generationProfile: GenerationProfile = {
    headline: career.headline ?? null,
    summary: career.summary ?? null,
    skills: career.skills ?? [],
    targetRoles: profileRow?.target_roles ?? [],
    experience: (career.experience ?? []) as GenerationProfile['experience'],
    education: (career.education ?? []) as GenerationProfile['education'],
  };

  let gen;
  try {
    const gateway = await buildGatewayForUser(user.id).catch(() => undefined);
    gen = await generateDocument({
      kind: 'CV',
      profile: generationProfile,
      job: {
        company: '',
        title: generationProfile.targetRoles[0] ?? generationProfile.headline ?? 'Target Role',
        description: parsed.data.jobDescription,
      },
      gateway,
    });
  } catch (err) {
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code, detail: String(err.message ?? '').slice(0, 500) }, { status: 502 });
    }
    throw err;
  }

  if (!gen.report.passed) {
    await meter.refund();
    return NextResponse.json({ error: 'TRUTHFULNESS_FAILED', report: gen.report }, { status: 422 });
  }

  await meter.commit();
  void recordGenerationUsage({ userId: user.id, feature: 'ai.resume', provider: gen.provider, latencyMs: Date.now() - resumeT0, status: 'ok' });

  void auditEvent({
    action: 'AI_RESUME_GENERATED',
    resource: 'ai',
    userId: user.id,
    meta: { provider: gen.provider },
  });

  return NextResponse.json({
    resume: gen.content,
    provider: gen.provider,
  });
}
