import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { auditEvent } from '@/lib/audit';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getAdminRadarDashboardData,
  isRadarSchemaMissingError,
  runBoundedRadarSweep,
} from '@/lib/radar/sync/persistence';
import { runAutonomousRadarCycle } from '@/lib/radar/pipeline/autonomous-orchestrator';

export const dynamic = 'force-dynamic';

const adminRadarActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('run_sweep'),
    maxSources: z.number().int().min(1).max(10).optional(),
  }),
  z.object({
    action: z.literal('run_autonomous_cycle'),
    maxSources: z.number().int().min(1).max(10).optional(),
  }),
  z.object({
    action: z.literal('review_candidate'),
    candidateId: z.string().uuid(),
    decision: z.enum(['PROMOTE', 'REJECT_COMPLIANCE', 'REJECT_DEAD']),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal('add_exclusion'),
    patternType: z.enum(['DOMAIN', 'URL_PREFIX', 'EMPLOYER_SLUG', 'ATS_BOARD']),
    patternValue: z.string().trim().min(2).max(240),
    reason: z.enum([
      'EMPLOYER_OPT_OUT',
      'TERMS_OF_SERVICE_PROHIBITED',
      'ROBOTS_DISALLOWED',
      'CONFIRMED_SCAM_DOMAIN',
      'LEGAL_TAKEDOWN',
      'ADMIN_BLOCK',
    ]),
    notes: z.string().trim().max(400).optional(),
  }),
]);

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`admin-radar-get:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    await requireAdminUser(req);
  } catch (err) {
    return adminErrorResponse(err);
  }

  try {
    const dashboard = await getAdminRadarDashboardData();
    return NextResponse.json({ ok: true, ...dashboard });
  } catch {
    return NextResponse.json({ error: 'ADMIN_RADAR_LOAD_FAILED' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`admin-radar-post:${ip}`, 20, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let admin;
  try {
    admin = await requireAdminUser(req);
  } catch (err) {
    return adminErrorResponse(err);
  }

  let body: z.infer<typeof adminRadarActionSchema>;
  try {
    body = adminRadarActionSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', detail: err instanceof Error ? err.message : 'INVALID_BODY' },
      { status: 400 },
    );
  }

  if (body.action === 'run_sweep') {
    const sweep = await runBoundedRadarSweep({ maxSources: body.maxSources ?? 4 });
    await auditEvent({
      userId: admin.id,
      action: 'admin.radar.sweep',
      resource: 'radar_crawl_runs',
      meta: {
        sourcesPolled: sweep.sourcesPolled,
        upsertedCount: sweep.upsertedCount,
        migrationPending: sweep.migrationPending,
      },
    });
    return NextResponse.json({ ok: true, sweep });
  }

  if (body.action === 'run_autonomous_cycle') {
    const cycle = await runAutonomousRadarCycle({
      maxAtsSources: body.maxSources ?? 5,
      maxCareerPages: 2,
      enableNetworkScout: true,
    });
    await auditEvent({
      userId: admin.id,
      action: 'admin.radar.autonomous_cycle',
      resource: 'radar_crawl_runs',
      meta: {
        scoutedCandidatesQueued: cycle.scoutedCandidatesQueued,
        candidatesAutoPromoted: cycle.candidatesAutoPromoted,
        atsSourcesPolled: cycle.atsSourcesPolled,
        careerPagesPolled: cycle.careerPagesPolled,
        totalJobsUpserted: cycle.totalJobsUpserted,
        usersNotified: cycle.alerts.usersNotified,
      },
    });
    return NextResponse.json({ ok: true, cycle });
  }

  if (body.action === 'add_exclusion') {
    const normalizedValue = body.patternValue.trim().toLowerCase();
    const { error } = await supabaseAdmin.from('radar_exclusions').upsert(
      {
        pattern_type: body.patternType,
        pattern_value: normalizedValue,
        reason: body.reason,
        requested_by: admin.email ?? admin.id,
        notes: body.notes ?? null,
        active: true,
      },
      { onConflict: 'pattern_type,pattern_value' },
    );
    if (error) {
      if (isRadarSchemaMissingError(error)) {
        return NextResponse.json({ error: 'RADAR_MIGRATION_PENDING' }, { status: 503 });
      }
      return NextResponse.json({ error: 'EXCLUSION_WRITE_FAILED' }, { status: 500 });
    }

    await auditEvent({
      userId: admin.id,
      action: 'admin.radar.exclusion.add',
      resource: 'radar_exclusions',
      resourceId: normalizedValue,
      meta: { patternType: body.patternType, reason: body.reason },
    });
    return NextResponse.json({ ok: true });
  }

  // `review_candidate`
  const { data: cand, error: loadErr } = await supabaseAdmin
    .from('radar_source_candidates')
    .select('*')
    .eq('id', body.candidateId)
    .maybeSingle();

  if (loadErr) {
    if (isRadarSchemaMissingError(loadErr)) {
      return NextResponse.json({ error: 'RADAR_MIGRATION_PENDING' }, { status: 503 });
    }
    return NextResponse.json({ error: 'CANDIDATE_LOAD_FAILED' }, { status: 500 });
  }
  if (!cand) {
    return NextResponse.json({ error: 'CANDIDATE_NOT_FOUND' }, { status: 404 });
  }

  const candRow = cand as {
    id: string;
    detected_provider?: string | null;
    detected_board_token?: string | null;
  };

  let promotedSourceId: string | null = null;
  if (body.decision === 'PROMOTE') {
    if (!candRow.detected_provider || !candRow.detected_board_token) {
      return NextResponse.json({ error: 'CANDIDATE_MISSING_PROVIDER_OR_TOKEN' }, { status: 400 });
    }
    promotedSourceId = `${candRow.detected_provider}:${candRow.detected_board_token}`;
    const { error: srcErr } = await supabaseAdmin.from('job_sources').upsert(
      {
        id: promotedSourceId,
        adapter: candRow.detected_provider,
        board: candRow.detected_board_token,
        enabled: true,
        collection_permission: 'EXPLICIT_PUBLIC_EMBED_API',
        commercial_indexing_allowed: true,
      },
      { onConflict: 'id' },
    );
    if (srcErr) {
      return NextResponse.json({ error: 'SOURCE_PROMOTE_FAILED' }, { status: 500 });
    }
  }

  const nextStatus =
    body.decision === 'PROMOTE'
      ? 'PROMOTED_TO_SOURCE'
      : body.decision === 'REJECT_COMPLIANCE'
        ? 'REJECTED_COMPLIANCE'
        : 'REJECTED_DEAD';

  await supabaseAdmin
    .from('radar_source_candidates')
    .update({
      review_status: nextStatus,
      rejection_reason: body.reason ?? null,
      promoted_source_id: promotedSourceId,
      evaluated_at: new Date().toISOString(),
    })
    .eq('id', body.candidateId);

  await auditEvent({
    userId: admin.id,
    action: 'admin.radar.candidate.review',
    resource: 'radar_source_candidates',
    resourceId: body.candidateId,
    meta: { decision: body.decision, promotedSourceId },
  });

  return NextResponse.json({ ok: true, status: nextStatus, promotedSourceId });
}
