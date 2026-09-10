import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { localResumeAIProvider } from '@/lib/resume-studio/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const body = z.object({
  action: z.enum(['suggestSkills', 'writeSummary', 'generateExperience', 'improveExperience', 'analyzeResume', 'optimizeForJob', 'recommendTemplate', 'extractProfile', 'finalReview']),
  draft: z.record(z.string(), z.unknown()).optional(),
  role: z.string().max(160).optional(),
  existing: z.array(z.string().max(120)).max(80).optional(),
  experience: z.record(z.string(), z.unknown()).optional(),
  bullets: z.array(z.string().max(320)).max(8).optional(),
  mode: z.enum(['stronger', 'simpler', 'technical', 'senior', 'ats']).optional(),
  seniority: z.string().max(80).optional(),
  jobDescription: z.string().max(30000).optional(),
  text: z.string().max(10000).optional(),
});

function friendlyError() {
  return NextResponse.json(
    {
      error: 'RESUME_AI_TEMPORARILY_UNAVAILABLE',
      message: "Looks like my writing assistant took a tiny coffee break. Let's try that again.",
    },
    { status: 502 },
  );
}

export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rl = await enforceRateLimit(`resume-studio:ai:${requestIp(req)}:${user.id}`, 30, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Slow down for a moment, then try again.' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });

  try {
    const input = parsed.data;
    if (input.action === 'suggestSkills') {
      return NextResponse.json(await localResumeAIProvider.suggestSkills({ role: input.role, existing: input.existing }));
    }
    if (input.action === 'writeSummary') {
      return NextResponse.json(await localResumeAIProvider.generateSummary(input.draft ?? {}));
    }
    if (input.action === 'generateExperience') {
      return NextResponse.json(await localResumeAIProvider.generateExperience({ experience: input.experience ?? {}, seniority: input.seniority }));
    }
    if (input.action === 'improveExperience') {
      return NextResponse.json(await localResumeAIProvider.improveExperience({ bullets: input.bullets ?? [], mode: input.mode ?? 'stronger', experience: input.experience ?? {}, seniority: input.seniority }));
    }
    if (input.action === 'analyzeResume') {
      return NextResponse.json(await localResumeAIProvider.analyzeResume(input.draft ?? {}));
    }
    if (input.action === 'optimizeForJob') {
      return NextResponse.json(await localResumeAIProvider.optimizeForJob(input.draft ?? {}, input.jobDescription ?? ''));
    }
    if (input.action === 'recommendTemplate') {
      return NextResponse.json(await localResumeAIProvider.recommendTemplate(input.draft ?? {}));
    }
    if (input.action === 'extractProfile') {
      return NextResponse.json(await localResumeAIProvider.extractProfile(input.text ?? ''));
    }
    return NextResponse.json(await localResumeAIProvider.finalReview(input.draft ?? {}));
  } catch {
    return friendlyError();
  }
}
