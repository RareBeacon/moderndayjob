import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { onboardingGateResponse } from '@/lib/onboarding-gate';
import { isTemplateId, portfolioLimitFor, sanitizePortfolioData, uniqueSlug } from '@/lib/portfolios';

export const dynamic = 'force-dynamic';

/**
 * Portfolio Studio API (Milestone 6).
 *
 * POST /api/portfolios: create (gated by onboarding + the plan's RECORD
 * limit, 1/5/10/26 per D1; NOT a ledger credit). New portfolios are
 * PRIVATE until the owner publishes them.
 * GET /api/portfolios: list the caller's portfolios.
 */

const createBody = z.object({
  title: z.string().trim().min(1).max(120),
  templateId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request) {
  const rl = await enforceRateLimit(`portfolios:list:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('portfolios')
    .select('id, slug, title, template_id, visibility, published_at, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'LIST_FAILED' }, { status: 500 });
  return NextResponse.json({ portfolios: data ?? [] });
}

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`portfolios:create:${requestIp(req)}`, 10, '1 h');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  // The onboarding gate protects portfolio creation (M1 gate list).
  const gated = await onboardingGateResponse(user);
  if (gated) return gated;

  const parsed = createBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  const title = parsed.data.title.trim();
  const templateId = isTemplateId(parsed.data.templateId) ? parsed.data.templateId : 'clean';
  const data = sanitizePortfolioData(parsed.data.data ?? {});

  // Record limit per plan (D1). Counted before insert; the race window is
  // narrow and the failure mode is one extra portfolio, never data loss.
  const limit = await portfolioLimitFor(user.id);
  const { count } = await supabaseAdmin
    .from('portfolios')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((count ?? 0) >= limit) {
    return NextResponse.json(
      { error: 'PORTFOLIO_LIMIT_REACHED', limit, message: `Your plan includes ${limit} portfolio${limit === 1 ? '' : 's'}. Upgrade for more, or reuse an existing one.` },
      { status: 403 },
    );
  }

  const slug = await uniqueSlug(title);
  const { data: created, error } = await supabaseAdmin
    .from('portfolios')
    .insert({ user_id: user.id, slug, title, template_id: templateId, data, visibility: 'PRIVATE' })
    .select('id, slug, title, template_id, visibility, created_at, updated_at')
    .single();
  if (error) return NextResponse.json({ error: 'CREATE_FAILED' }, { status: 500 });
  return NextResponse.json({ portfolio: created }, { status: 201 });
}
