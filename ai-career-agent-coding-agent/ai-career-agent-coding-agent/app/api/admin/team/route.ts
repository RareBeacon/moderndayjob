import { z } from 'zod';
import {
  requireOwnerAdmin,
  requireAdminPermission,
  appendAdminAuditLog,
  adminErrorResponse,
  CONFIGURABLE_ADMIN_PERMISSIONS,
} from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

/**
 * GET / POST / DELETE /api/admin/team
 *
 * 3-Tier Admin RBAC Management:
 *   - Level 1: OWNER / Super Admin (sole account, DB-protected, non-assignable, non-removable)
 *   - Level 2: SUB_ADMIN (configurable granular permissions)
 *   - Level 3: STAFF (least-privilege support & triage permissions)
 *
 * Mutations (POST/DELETE) are strictly restricted to the Level 1 OWNER.
 */

const upsertBody = z.object({
  email: z.string().trim().email().max(200).optional(),
  userId: z.guid().optional(),
  role: z.enum(['SUB_ADMIN', 'STAFF']),
  permissions: z.record(z.string(), z.boolean()).default({}),
  notes: z.string().trim().max(300).optional(),
  reason: z.string().trim().min(5).max(300),
});

const removeBody = z.object({
  userId: z.guid(),
  reason: z.string().trim().min(5).max(300),
});

export async function GET(req: Request) {
  const rl = await enforceRateLimit(`admin:team:get:${requestIp(req)}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const { admin } = await requireAdminPermission('can_view_security', req);
    const { data: rows, error } = await supabaseAdmin
      .from('admin_users')
      .select('user_id, role, is_owner, is_active, require_mfa, permissions, notes, created_at, updated_at')
      .order('is_owner', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;

    const userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id);
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from('profiles').select('user_id, full_name, email').in('user_id', userIds)
      : { data: [] as Array<{ user_id: string; full_name?: string | null; email?: string | null }> };

    const profileMap = new Map(
      (profiles ?? []).map((p: { user_id: string; full_name?: string | null; email?: string | null }) => [p.user_id, p]),
    );

    return Response.json({
      viewer: { userId: admin.userId, role: admin.role, isOwner: admin.isOwner },
      availablePermissions: CONFIGURABLE_ADMIN_PERMISSIONS,
      members: (rows ?? []).map((r: Record<string, unknown>) => {
        const prof = profileMap.get(String(r.user_id));
        const rawEmail = prof?.email ?? '';
        const maskedEmail = admin.isOwner
          ? rawEmail
          : rawEmail.includes('@')
            ? `${rawEmail.slice(0, 2)}***@${rawEmail.split('@')[1]}`
            : '-';
        return {
          userId: r.user_id,
          fullName: prof?.full_name ?? 'Admin User',
          email: maskedEmail,
          role: r.role,
          isOwner: Boolean(r.is_owner),
          isActive: r.is_active !== false,
          requireMfa: r.require_mfa !== false,
          permissions: r.permissions ?? {},
          notes: r.notes ?? '',
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      }),
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:team:post:${requestIp(req)}`, 15, '10 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const { admin } = await requireOwnerAdmin(req);
    const parsed = upsertBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'INVALID_BODY', issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }

    const { email, userId, role, permissions, notes, reason } = parsed.data;
    let targetUserId = userId ?? null;

    if (!targetUserId && email) {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .ilike('email', email)
        .maybeSingle();
      targetUserId = (prof as { user_id?: string } | null)?.user_id ?? null;
    }
    if (!targetUserId) {
      return Response.json({ error: 'USER_NOT_FOUND', message: 'No registered Jobiest account matches that email or user ID.' }, { status: 404 });
    }

    if (targetUserId === admin.userId) {
      return Response.json({ error: 'OWNER_PROTECTED', message: 'The Owner account cannot be reassigned to Sub-Admin or Staff.' }, { status: 403 });
    }

    const allowedKeys = new Set<string>(CONFIGURABLE_ADMIN_PERMISSIONS.map((p) => p.key));
    const cleanPermissions: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(permissions)) {
      if (allowedKeys.has(k) && k !== 'can_manage_admins') {
        if (role === 'STAFF' && (k === 'can_terminate_users' || k === 'can_manage_credentials')) continue;
        cleanPermissions[k] = Boolean(v);
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('admin_users')
      .select('user_id, role, is_owner, permissions, is_active')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (existing && (existing as { is_owner?: boolean }).is_owner) {
      return Response.json({ error: 'OWNER_PROTECTED', message: 'The Owner account cannot be modified.' }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from('admin_users').upsert(
      {
        user_id: targetUserId,
        role,
        is_owner: false,
        is_active: true,
        require_mfa: true,
        permissions: cleanPermissions,
        assigned_by: admin.userId,
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw error;

    await appendAdminAuditLog({
      actorUserId: admin.userId,
      actorRole: admin.role,
      action: existing ? 'ADMIN_ROLE_UPDATED' : 'ADMIN_ROLE_ASSIGNED',
      targetType: 'admin_user',
      targetId: targetUserId,
      beforeState: (existing as Record<string, unknown> | null) ?? null,
      afterState: { role, permissions: cleanPermissions, is_active: true },
      reason,
      req,
      mfaVerified: true,
    });

    return Response.json({ ok: true, userId: targetUserId, role, permissions: cleanPermissions });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  const rl = await enforceRateLimit(`admin:team:delete:${requestIp(req)}`, 10, '10 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const { admin } = await requireOwnerAdmin(req);
    const parsed = removeBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });

    const { userId, reason } = parsed.data;
    if (userId === admin.userId) {
      return Response.json({ error: 'OWNER_PROTECTED', message: 'The Owner account cannot be removed.' }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from('admin_users')
      .select('user_id, role, is_owner, permissions')
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    if ((existing as { is_owner?: boolean }).is_owner) {
      return Response.json({ error: 'OWNER_PROTECTED' }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from('admin_users').delete().eq('user_id', userId);
    if (error) throw error;

    await appendAdminAuditLog({
      actorUserId: admin.userId,
      actorRole: admin.role,
      action: 'ADMIN_ROLE_REVOKED',
      targetType: 'admin_user',
      targetId: userId,
      beforeState: existing as Record<string, unknown>,
      afterState: null,
      reason,
      req,
      mfaVerified: true,
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
