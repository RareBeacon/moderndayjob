import { z } from 'zod';
import {
  adminErrorResponse,
  appendAdminAuditLog,
  getAdminContext,
  hasAdminPermission,
  requireAdminUser,
} from '@/lib/admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';

const patchSchema = z.object({
  status: z
    .enum([
      'NEW',
      'UNDER_REVIEW',
      'SHORTLISTED',
      'DISCOVERY_CALL',
      'TRIAL_60_DAY',
      'ACCEPTED',
      'PARTNERSHIP_ACTIVE',
      'ON_HOLD',
      'DECLINED',
      'ARCHIVED',
    ])
    .optional(),
  priorityBand: z.enum(['TOP_PRIORITY', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  review60dDueAt: z.string().trim().nullable().optional(),
  nextFollowUpAt: z.string().trim().nullable().optional(),
  internalNotes: z.string().trim().max(4000).nullable().optional(),
  decisionMakerContact: z.string().trim().max(240).nullable().optional(),
  partnershipVerified: z.boolean().optional(),
  verificationBasis: z
    .enum([
      'SIGNED_MOU_OR_PILOT',
      'EMPLOYER_ACCOUNT_CREATED',
      'ACTIVE_VACANCY_SHARED',
      'RECRUITMENT_AGENCY_COLLAB',
      'WRITTEN_PILOT_CONFIRMATION',
    ])
    .optional(),
  timelineNote: z.string().trim().max(1500).optional(),
});

/**
 * GET   /api/admin/programme/[id] -> Single CRM record + ordered event history.
 * PATCH /api/admin/programme/[id] -> Update CRM stage, dates, notes, or verified partnership status.
 *
 * Non-negotiable Business Rule #1 enforced server-side:
 * An outbound email alone never counts as a verified partnership. Setting
 * `partnershipVerified = true` requires an explicit `verificationBasis` and
 * decision-maker contact.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireAdminUser(req);
  } catch (err) {
    return adminErrorResponse(err);
  }

  const rl = await enforceRateLimit(`admin:programme:detail:${user.id}`, 120, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  const [{ data: record, error }, { data: events }] = await Promise.all([
    supabaseAdmin.from('programme_applications').select('*').eq('id', id).maybeSingle(),
    supabaseAdmin
      .from('programme_application_events')
      .select('id, actor_user_id, event_type, from_status, to_status, note, metadata, created_at')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (error || !record) {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return Response.json({ record, events: events ?? [] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let user;
  let admin;
  try {
    user = await requireAdminUser(req);
    admin = await getAdminContext(user.id, user.email ?? null);
    if (!admin || !hasAdminPermission(admin, 'can_manage_programme')) {
      throw new Error('FORBIDDEN');
    }
  } catch (err) {
    return adminErrorResponse(err);
  }

  const rl = await enforceRateLimit(`admin:programme:update:${user.id}`, 60, '10 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const { data: before } = await supabaseAdmin
    .from('programme_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!before) {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (input.partnershipVerified === true) {
    const contact = input.decisionMakerContact ?? before.decision_maker_contact;
    if (!input.verificationBasis || !contact || String(contact).trim().length < 3) {
      return Response.json(
        {
          error: 'PARTNERSHIP_VERIFICATION_BASIS_REQUIRED',
          message:
            'A partnership cannot be marked verified from an email sent alone. Select one of the 5 documented verification criteria and confirm the decision-maker contact.',
        },
        { status: 400 },
      );
    }
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.priorityBand !== undefined) updatePayload.priority_band = input.priorityBand;
  if (input.review60dDueAt !== undefined) updatePayload.review_60d_due_at = input.review60dDueAt || null;
  if (input.nextFollowUpAt !== undefined) updatePayload.next_follow_up_at = input.nextFollowUpAt || null;
  if (input.internalNotes !== undefined) updatePayload.internal_notes = input.internalNotes;
  if (input.decisionMakerContact !== undefined) updatePayload.decision_maker_contact = input.decisionMakerContact;

  if (input.status === 'TRIAL_60_DAY' && !before.review_60d_due_at && !input.review60dDueAt) {
    updatePayload.review_60d_due_at = new Date(Date.now() + 60 * 86_400_000).toISOString();
  }

  if (input.partnershipVerified !== undefined) {
    updatePayload.partnership_verified = input.partnershipVerified;
    updatePayload.partnership_verified_at = input.partnershipVerified ? new Date().toISOString() : null;
    if (input.partnershipVerified && !input.status && before.status !== 'PARTNERSHIP_ACTIVE') {
      updatePayload.status = 'PARTNERSHIP_ACTIVE';
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('programme_applications')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !updated) {
    return Response.json({ error: 'DB_ERROR' }, { status: 500 });
  }

  await supabaseAdmin.from('programme_application_events').insert({
    application_id: id,
    actor_user_id: user.id,
    event_type:
      input.partnershipVerified === true
        ? 'PARTNERSHIP_VERIFIED'
        : input.status && input.status !== before.status
          ? 'STAGE_CHANGED'
          : 'CRM_UPDATED',
    from_status: before.status,
    to_status: updated.status,
    note:
      input.timelineNote ||
      (input.partnershipVerified === true
        ? `Partnership verified (${input.verificationBasis})`
        : input.status && input.status !== before.status
          ? `Stage moved from ${before.status} to ${updated.status}`
          : 'CRM fields updated'),
    metadata: {
      verificationBasis: input.verificationBasis ?? null,
      priorityBand: updated.priority_band,
    },
  });

  await appendAdminAuditLog({
    actorUserId: user.id,
    actorRole: admin.role,
    action: input.partnershipVerified === true ? 'PROGRAMME_PARTNERSHIP_VERIFY' : 'PROGRAMME_CRM_UPDATE',
    targetType: 'programme_applications',
    targetId: id,
    reason: input.timelineNote ?? input.verificationBasis ?? null,
    beforeState: { status: before.status, partnership_verified: before.partnership_verified },
    afterState: {
      status: updated.status,
      partnership_verified: updated.partnership_verified,
      verificationBasis: input.verificationBasis ?? null,
    },
    req,
  });

  return Response.json({ ok: true, record: updated });
}
