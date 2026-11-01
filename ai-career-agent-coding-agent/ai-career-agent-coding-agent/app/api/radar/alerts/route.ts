import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auditEvent } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import {
  getCandidateAlertSettings,
  upsertCandidateAlertSettings,
} from '@/lib/radar/alerts/dispatcher';
import { WORKPLACE_TYPES } from '@/lib/radar/types';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const alertUpdateSchema = z.object({
  enabled: z.boolean(),
  exclusivityOnly: z.boolean().default(true),
  minConfidence: z.number().int().min(50).max(100).default(80),
  workplaceTypes: z.array(z.enum(WORKPLACE_TYPES)).max(4).default([]),
  targetRoles: z.array(z.string().trim().min(2).max(100)).max(12).default([]),
  countryCodes: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z]{2}$/)
        .transform((v) => v.toUpperCase()),
    )
    .max(12)
    .default([]),
  frequency: z.enum(['DAILY', 'INSTANT', 'PAUSED']).default('DAILY'),
  emailEnabled: z.boolean().default(false),
});

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`radar-alerts-get:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  try {
    const out = await getCandidateAlertSettings(user.id);
    return NextResponse.json({
      ok: true,
      migrationPending: out.migrationPending,
      settings: out.settings,
    });
  } catch {
    return NextResponse.json({ error: 'RADAR_ALERTS_LOAD_FAILED' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`radar-alerts-put:${ip}`, 20, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = alertUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const out = await upsertCandidateAlertSettings({
      userId: user.id,
      ...parsed.data,
    });

    await auditEvent({
      userId: user.id,
      action: 'radar.alerts.updated',
      resource: 'radar_candidate_alerts',
      resourceId: user.id,
      meta: {
        enabled: out.settings.enabled,
        frequency: out.settings.frequency,
        exclusivityOnly: out.settings.exclusivityOnly,
      },
    });

    return NextResponse.json({
      ok: true,
      migrationPending: out.migrationPending,
      settings: out.settings,
    });
  } catch {
    return NextResponse.json({ error: 'RADAR_ALERTS_SAVE_FAILED' }, { status: 500 });
  }
}
