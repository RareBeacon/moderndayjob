import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { isTemplateId, sanitizePortfolioData, slugAvailable, slugBase } from '@/lib/portfolios';

export const dynamic = 'force-dynamic';

/**
 * GET / PATCH / DELETE /api/portfolios/[id]: the owner's portfolio detail.
 * Ownership is enforced by the user_id filter on every statement
 * (IDOR-safe). PATCH handles content edits, template changes, visibility
 * (publishing) and renames; a rename stores the previous slug so public
 * links redirect permanently instead of breaking.
 */

const patchBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  templateId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  visibility: z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']).optional(),
  rename: z.boolean().optional(),
});

type Row = {
  id: string; user_id: string; slug: string; previous_slug: string | null; title: string;
  template_id: string; data: Record<string, unknown>; visibility: string;
  published_at: string | null; created_at: string; updated_at: string;
};

async function loadOwned(id: string, userId: string): Promise<Row | null> {
  const { data } = await supabaseAdmin
    .from('portfolios')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`portfolios:get:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const { id } = await params;
  const row = await loadOwned(id, user.id);
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ portfolio: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`portfolios:patch:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const { id } = await params;
  const row = await loadOwned(id, user.id);
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const parsed = patchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  const body = parsed.data;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) update.title = body.title;
  if (body.data !== undefined) update.data = sanitizePortfolioData(body.data);
  if (body.templateId !== undefined) update.template_id = isTemplateId(body.templateId) ? body.templateId : row.template_id;

  if (body.visibility !== undefined) {
    update.visibility = body.visibility;
    if (body.visibility === 'PRIVATE') update.published_at = null;
    else update.published_at = row.published_at ?? new Date().toISOString();
  }

  // Rename: new unique slug; the old one is kept as previous_slug so the
  // public link 301-redirects to the new slug instead of dying.
  if (body.rename) {
    const newTitle = (body.title ?? row.title).trim();
    const candidate = `${slugBase(newTitle)}-${Math.random().toString(36).slice(2, 8)}`;
    if (candidate !== row.slug && (await slugAvailable(candidate))) {
      update.slug = candidate;
      update.previous_slug = row.slug;
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('portfolios')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, slug, title, template_id, visibility, published_at, updated_at')
    .single();
  if (error) return NextResponse.json({ error: 'UPDATE_FAILED' }, { status: 500 });
  return NextResponse.json({ portfolio: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`portfolios:delete:${requestIp(req)}`, 20, '1 h');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from('portfolios').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
