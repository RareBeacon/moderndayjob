import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { createUsageMeter } from '@/lib/ai/server';
import { stripDashes } from '@/lib/ai/sanitize';
import { auditEvent } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase';
import { buildFallbackCV, SAFE_FALLBACK_PROVIDER } from '@/lib/generation/fallback';
import type { CVOutput, GenerationProfile } from '@/lib/generation/types';

const body = z.object({
  jobDescription: z.string().min(30).max(30000),
  // Kept for client compatibility. The safe route no longer depends on these.
  provider: z.enum(['openrouter', 'huggingface']).optional(),
  model: z.string().min(1).max(200).optional(),
});

export const maxDuration = 300;

function cvToText(cv: CVOutput): string {
  const sections: string[] = [];
  sections.push(cv.headline);
  if (cv.summary) sections.push(`Summary\n${cv.summary}`);
  if (cv.experiences.length) {
    sections.push(
      `Experience\n${cv.experiences
        .map((e) => {
          const head = [e.title, e.company].filter(Boolean).join(' - ');
          const bullets = e.bullets.map((b) => `- ${b}`).join('\n');
          return [head, bullets].filter(Boolean).join('\n');
        })
        .join('\n\n')}`,
    );
  }
  if (cv.skills.length) sections.push(`Skills\n${cv.skills.join(', ')}`);
  if (cv.education.length) {
    sections.push(
      `Education\n${cv.education
        .map((e) => [e.qualification, e.institution].filter(Boolean).join(' - '))
        .filter(Boolean)
        .join('\n')}`,
    );
  }
  return stripDashes(sections.filter(Boolean).join('\n\n'));
}

export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
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

  const meter = createUsageMeter(user.id);
  try {
    await meter.reserve();
  } catch (err) {
    if (err instanceof AIGatewayError && err.code === 'AI_QUOTA_EXHAUSTED') {
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
  const cv = buildFallbackCV(generationProfile);

  void auditEvent({
    action: 'AI_RESUME_GENERATED',
    resource: 'ai',
    userId: user.id,
    meta: { provider: SAFE_FALLBACK_PROVIDER },
  });

  return NextResponse.json({
    resume: cvToText(cv),
    provider: SAFE_FALLBACK_PROVIDER,
  });
}
