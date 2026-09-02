import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { AICredentialMissingError, buildGatewayForUser, createUsageMeter } from '@/lib/ai/server';
import { generateSalaryInsights } from '@/lib/analysis/service';
import { supabaseAdmin } from '@/lib/supabase';

const body = z.object({ role: z.string().trim().min(2).max(60) });

const SCAN_LIMIT = 20;

/**
 * POST /api/ai/salary-insights — report ONLY pay ranges explicitly stated
 * in real listings from the job pool. No estimates, no averages, no market
 * claims. Empty pool → honest empty answer, no credit spent.
 */
export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await enforceRateLimit(`ai:salary:${requestIp(req)}:${user.id}`, 10, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const { role } = parsed.data;

  // Deterministic pool selection: newest listings whose title matches the role.
  const { data: pool } = await supabaseAdmin
    .from('jobs')
    .select('id, title, company, description')
    .ilike('title', `%${role.replace(/[%_]/g, '')}%`)
    .order('created_at', { ascending: false })
    .limit(SCAN_LIMIT);
  const jobs = (pool ?? []) as { id: string; title: string; company: string; description: string }[];

  if (jobs.length === 0) {
    return NextResponse.json({
      scannedCount: 0,
      statedCount: 0,
      ranges: [],
      note: `No listings matching “${role}” are in the job pool yet, so there is nothing truthful to report. Check back after the next sync.`,
    });
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
    const result = await generateSalaryInsights({ gateway, jobs });
    if (!result.verified) {
      // A cited listing we never scanned = fabrication → reject + refund.
      await meter.refund();
      return NextResponse.json({ error: 'TRUTHFULNESS_FAILED', summary: 'The draft cited a listing outside the scanned set.' }, { status: 422 });
    }
    return NextResponse.json({
      scannedCount: jobs.length,
      statedCount: result.ranges.length,
      ranges: result.ranges,
      notes: result.notes,
      provider: result.provider,
      note: 'Only pay ranges explicitly stated in listings are shown. Most employers do not state pay — treat these as signals, not market rates.',
    });
  } catch (err) {
    await meter.refund();
    if (err instanceof AIGatewayError) {
      return NextResponse.json({ error: err.code }, { status: 502 });
    }
    throw err;
  }
}
