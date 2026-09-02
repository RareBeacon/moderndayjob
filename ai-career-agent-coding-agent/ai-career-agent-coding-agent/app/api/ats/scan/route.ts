import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { scanResume } from '@/lib/ats/scan';

const body = z.object({
  resumeText: z.string().min(100).max(60000),
  jobDescription: z.string().min(30).max(30000).optional(),
});

/**
 * POST /api/ats/scan, deterministic ATS-style scan of pasted CV text.
 * No AI, no credits: every check is a fixed public rubric on structure and
 * parseability. Optional job description adds keyword overlap.
 */
export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`ats:scan:${requestIp(req)}:${user.id}`, 20, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const { resumeText, jobDescription } = parsed.data;
  const result = scanResume(resumeText, jobDescription);
  return NextResponse.json({ ...result, note: 'Deterministic checks on structure and parseability, this score never judges your worth as a candidate.' });
}
