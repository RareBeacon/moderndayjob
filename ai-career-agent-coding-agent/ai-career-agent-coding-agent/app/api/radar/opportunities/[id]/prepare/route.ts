import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auditEvent } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import {
  buildAndSaveAssistedPreparation,
  recordHumanApprovalForPrep,
} from '@/lib/radar/forms/assisted-prep';
import { isRadarSchemaMissingError } from '@/lib/radar/sync/persistence';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const uuidSchema = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

const postBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate'),
    useAiPitch: z.boolean().optional().default(true),
  }),
  z.object({
    action: z.literal('approve_human_review'),
  }),
]);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`radar-prep-get:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'INVALID_OPPORTUNITY_ID' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('radar_assisted_preparations')
    .select('*')
    .eq('user_id', user.id)
    .eq('radar_job_id', id)
    .maybeSingle();

  if (error) {
    if (isRadarSchemaMissingError(error)) {
      return NextResponse.json({ ok: true, migrationPending: true, pack: null });
    }
    return NextResponse.json({ error: 'LOAD_PREP_FAILED' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, migrationPending: false, pack: null });
  }

  const row = data as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    migrationPending: false,
    pack: {
      id: row.id ?? null,
      radarJobId: row.radar_job_id,
      applicationFormId: row.application_form_id ?? null,
      applyUrl: row.apply_url,
      applyMechanism: row.apply_mechanism,
      tailoredPitch: row.tailored_pitch ?? '',
      draftAnswers: Array.isArray(row.draft_answers) ? row.draft_answers : [],
      safetyNotes: Array.isArray(row.safety_notes) ? row.safety_notes : [],
      requiresHumanReview: true,
      status: row.status ?? 'DRAFT_FOR_HUMAN_REVIEW',
      humanApprovedAt: row.human_approved_at ?? null,
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`radar-prep-post:${ip}`, 20, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'INVALID_OPPORTUNITY_ID' }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.action === 'approve_human_review') {
    const out = await recordHumanApprovalForPrep({
      userId: user.id,
      radarJobId: id,
    });
    await auditEvent({
      userId: user.id,
      action: 'radar.assisted_prep.human_approved',
      resource: 'radar_assisted_preparations',
      resourceId: id,
      meta: { approved: out.approved },
    });
    return NextResponse.json({
      ok: true,
      migrationPending: out.migrationPending,
      approved: out.approved,
      approvedAt: out.approvedAt,
    });
  }

  try {
    const out = await buildAndSaveAssistedPreparation({
      userId: user.id,
      radarJobId: id,
      useAiPitch: parsed.data.useAiPitch,
    });

    if (out.blockedReason) {
      return NextResponse.json(
        { ok: false, error: out.blockedReason },
        { status: out.blockedReason === 'OPPORTUNITY_NOT_FOUND' ? 404 : 422 },
      );
    }

    await auditEvent({
      userId: user.id,
      action: 'radar.assisted_prep.generated',
      resource: 'radar_assisted_preparations',
      resourceId: id,
      meta: { applyMechanism: out.pack?.applyMechanism ?? null },
    });

    return NextResponse.json({
      ok: true,
      migrationPending: out.migrationPending,
      pack: out.pack,
    });
  } catch {
    return NextResponse.json({ error: 'PREP_GENERATION_FAILED' }, { status: 500 });
  }
}
