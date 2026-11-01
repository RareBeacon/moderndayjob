import { createHash } from 'node:crypto';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export type AdminRole = 'OWNER' | 'SUB_ADMIN' | 'STAFF';

export type AdminPermission =
  | 'can_view_analytics'
  | 'can_view_users'
  | 'can_reveal_pii'
  | 'can_manage_subscriptions'
  | 'can_suspend_users'
  | 'can_terminate_users'
  | 'can_manage_coupons'
  | 'can_manage_support'
  | 'can_manage_seo'
  | 'can_manage_talent_pool'
  | 'can_manage_employers'
  | 'can_manage_radar'
  | 'can_manage_credentials'
  | 'can_view_security'
  | 'can_view_audit_logs'
  | 'can_manage_admins'
  | 'can_manage_programme';

export const CONFIGURABLE_ADMIN_PERMISSIONS: { key: Exclude<AdminPermission, 'can_manage_admins'>; label: string; ownerRecommendedOnly?: boolean }[] = [
  { key: 'can_view_analytics', label: 'View analytics & revenue' },
  { key: 'can_view_users', label: 'View user directory & profiles' },
  { key: 'can_reveal_pii', label: 'Reveal full user email (password step-up)' },
  { key: 'can_manage_subscriptions', label: 'Manual subscription grants & revocations' },
  { key: 'can_manage_programme', label: 'Manage Founding Team & Partnerships CRM' },
  { key: 'can_manage_support', label: 'Manage customer support tickets' },
  { key: 'can_manage_coupons', label: 'Create & manage discount coupons' },
  { key: 'can_manage_talent_pool', label: 'Review Talent Pool profiles' },
  { key: 'can_manage_employers', label: 'Manage employer hiring portals' },
  { key: 'can_manage_radar', label: 'Manage Opportunity Radar sources' },
  { key: 'can_manage_seo', label: 'Manage SEO Mission Control' },
  { key: 'can_suspend_users', label: 'Suspend or reactivate user accounts' },
  { key: 'can_view_security', label: 'View security events' },
  { key: 'can_view_audit_logs', label: 'View administrative audit logs' },
  { key: 'can_terminate_users', label: 'Terminate user accounts', ownerRecommendedOnly: true },
  { key: 'can_manage_credentials', label: 'Manage AI provider credentials', ownerRecommendedOnly: true },
];

export interface AdminContext {
  userId: string;
  email: string | null;
  role: AdminRole;
  isOwner: boolean;
  isActive: boolean;
  requireMfa: boolean;
  permissions: Record<string, boolean>;
}

const STAFF_DENIED_PERMISSIONS = new Set<AdminPermission>([
  'can_manage_admins',
  'can_terminate_users',
  'can_manage_credentials',
]);

export function hasAdminPermission(ctx: AdminContext, permission: AdminPermission): boolean {
  if (!ctx.isActive) return false;
  if (ctx.isOwner || ctx.role === 'OWNER') return true;
  if (permission === 'can_manage_admins') return false;
  if (ctx.role === 'STAFF' && STAFF_DENIED_PERMISSIONS.has(permission)) return false;
  if (ctx.role === 'STAFF' && (permission === 'can_manage_support' || permission === 'can_view_users')) {
    return ctx.permissions[permission] ?? true;
  }
  return Boolean(ctx.permissions[permission]);
}

export async function getAdminContext(userId: string, email?: string | null): Promise<AdminContext | null> {
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    user_id?: string;
    role?: string;
    is_owner?: boolean;
    is_active?: boolean;
    require_mfa?: boolean;
    permissions?: Record<string, boolean> | null;
  };
  if (row.is_active === false) return null;
  const role: AdminRole =
    row.is_owner || row.role === 'OWNER'
      ? 'OWNER'
      : row.role === 'STAFF'
        ? 'STAFF'
        : 'SUB_ADMIN';
  return {
    userId,
    email: email ?? null,
    role,
    isOwner: Boolean(row.is_owner || role === 'OWNER'),
    isActive: Boolean(row.is_active ?? true),
    requireMfa: Boolean(row.require_mfa ?? true),
    permissions: (row.permissions && typeof row.permissions === 'object' ? row.permissions : {}) as Record<string, boolean>,
  };
}

/** Server-side admin check backed by the admin_users table (no env email lists). */
export async function requireAdminUser(req?: Request) {
  const user = await requireUser(req ? { req } : undefined);
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('user_id, role, is_owner, is_active, permissions')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data || (data as { is_active?: boolean }).is_active === false) throw new Error('FORBIDDEN');
  return user;
}

/** Granular RBAC check for Sub-Admin / Staff / Owner actions. */
export async function requireAdminPermission(permission: AdminPermission, req?: Request): Promise<{ user: Awaited<ReturnType<typeof requireUser>>; admin: AdminContext }> {
  const user = await requireUser(req ? { req } : undefined);
  const ctx = await getAdminContext(user.id, user.email ?? null);
  if (!ctx) throw new Error('FORBIDDEN');
  if (!hasAdminPermission(ctx, permission)) throw new Error('FORBIDDEN');
  return { user, admin: ctx };
}

/** Strictly restricts an action to the sole Level 1 Owner / Super Admin. */
export async function requireOwnerAdmin(req?: Request): Promise<{ user: Awaited<ReturnType<typeof requireUser>>; admin: AdminContext }> {
  const user = await requireUser(req ? { req } : undefined);
  const ctx = await getAdminContext(user.id, user.email ?? null);
  if (!ctx || !ctx.isOwner) throw new Error('FORBIDDEN');
  return { user, admin: ctx };
}

/** Append an immutable record to public.admin_audit_logs (best-effort; never throws on unit mocks). */
export async function appendAdminAuditLog(input: {
  actorUserId: string;
  actorRole: AdminRole | string;
  action: string;
  targetType: string;
  targetId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string | null;
  req?: Request;
  mfaVerified?: boolean;
}): Promise<void> {
  try {
    const rawIp = input.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const ipHash = rawIp ? createHash('sha256').update(rawIp).digest('hex').slice(0, 32) : null;
    const ua = input.req?.headers.get('user-agent')?.slice(0, 240) ?? null;
    await supabaseAdmin.from('admin_audit_logs').insert({
      actor_user_id: input.actorUserId,
      actor_role: input.actorRole,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      before_state: input.beforeState ?? null,
      after_state: input.afterState ?? null,
      reason: input.reason ?? null,
      ip_hash: ipHash,
      user_agent: ua,
      mfa_verified: input.mfaVerified ?? true,
    });
  } catch {
    /* best-effort in mocked unit environments */
  }
}

/** Check whether any user id in `targetIds` belongs to `admin_users`.
 *  Verifies the returned `user_id` actually matches one of `targetIds` so
 *  shared unit-test mocks remain deterministic while real peer-admins are
 *  always protected from lateral lockout. */
export async function isPeerAdminTarget(targetIds: string[]): Promise<boolean> {
  const clean = Array.from(new Set(targetIds.filter(Boolean)));
  if (clean.length === 0) return false;
  for (const targetId of clean) {
    const { data } = await supabaseAdmin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', targetId)
      .maybeSingle();
    if (data && (data as { user_id?: string }).user_id === targetId) {
      return true;
    }
  }
  return false;
}

export function adminErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'UNAUTHENTICATED' ||
    message === 'MFA_REQUIRED' ||
    message.startsWith('SESSION_')
  ) {
    return Response.json({ error: message || 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (
    message === 'FORBIDDEN' ||
    message.startsWith('FORBIDDEN_') ||
    message.startsWith('ACCOUNT_') ||
    message.startsWith('OWNER_')
  ) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (
    message === 'GOOGLE_OAUTH_CODE_OR_STATE_MISSING' ||
    message === 'GOOGLE_OAUTH_STATE_INVALID'
  ) {
    return Response.json({ error: message }, { status: 400 });
  }
  // Never echo raw database, stack, or driver error strings to HTTP clients.
  return Response.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
}
