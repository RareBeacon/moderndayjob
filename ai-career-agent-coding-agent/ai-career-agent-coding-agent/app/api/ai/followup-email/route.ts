import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { AICredentialMissingError, buildGatewayForUser, createUsageMeter } from '@/lib/ai/server';
import { generateFollowupEmail } from '@/lib/analysis/service';
import { supabaseAdmin } from '@/lib/supabase';

const manual = z.object({
  company: z.string().trim().min(2).max(120),
  role: z.string().trim().min(2).max(160),
  daysSinceApplied: z.number().int().min(1).max(90),
  contactName: z.string().trim().min(2).max(120).optional(),
  note: z.string().trim().min(5).max(500).optional(),
  applicationId: z.string().uuid().optional(),
});

/**
 * POST /api/ai/followup-email, polite follow-up drafted from facts the user
 * supplies (or from a real tracked application). No qualification claims →
 * no truthfulness gate. One AI credit, refunded on provider failure.
 */
export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`ai:followup:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = manual.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;

  // Prefer a real tracked application when an id is given (ownership enforced).
  let company = b.company;
  let role = b.role;
  let days = b.daysSinceApplied;
  if (b.applicationId) {
    const { data: app } = await supabaseAdmin
      .from('applications')
      .select('id, created_at, submitted_at, jobs(company, title)')
      .eq('id', b.applicationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!app) return NextResponse.json({ error: 'APPLICATION_NOT_FOUND' }, { status: 404 });
    const job = (app as unknown as { jobs: { company: string | null; title: string | null } | null }).jobs;
    company = job?.company ?? b.company;
    role = job?.title ?? b.role;
    const when = (app as unknown as { submitted_at: string | null; created_at: string }).submitted_at ?? (app as unknown as { created_at: string }).created_at;
    days = Math.max(1, Math.min(90, Math.floor((Date.now() - new Date(when).getTime()) / 86_400_000)));
  }

  const entitlement = await assertEntitlement(user.id, 'ai');
  if (Number(entitlement.ai_credits_remaining) <= 0) {
    return NextResponse.json({ error: 'DAILY_AI_CREDITS_EXHAUSTED' }, { status: 429 });
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
    const result = await generateFollowupEmail({ gateway, company, role, daysSinceApplied: days, contactName: b.contactName, note: b.note });
    return NextResponse.json({ email: result });
  } catch (err) {
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code }, { status: 502 });
    }
    throw err;
  }
}
