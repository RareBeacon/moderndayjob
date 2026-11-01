import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { verifyRevealToken } from '@/lib/security/reveal';
import { requireAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const purgeBodySchema = z.object({
  confirm: z.literal('PURGE_NON_ADMIN_USERS'),
  revealToken: z.string().min(10).max(512),
});

/**
 * Destructive pre-launch reset endpoint.
 *
 * Security invariants:
 *   1. Admin-only (`requireAdminUser(req)`).
 *   2. Disabled in `NODE_ENV === 'production'` unless the explicit break-glass
 *      env flag `ALLOW_DESTRUCTIVE_ADMIN_PURGE=true` is set.
 *   3. `POST` requires BOTH `{ confirm: 'PURGE_NON_ADMIN_USERS' }` AND a fresh
 *      5-minute password re-authentication token (`revealToken`).
 *   4. Writes a fail-closed `ADMIN_MASS_USER_PURGE` audit log BEFORE deleting
 *      any user row, and never touches `admin_users` accounts.
 */
async function collectTargets() {
  const { data: admins, error: adminErr } = await supabaseAdmin.from('admin_users').select('user_id');
  if (adminErr) throw new Error('ADMIN_LOOKUP_FAILED');
  const adminIds = new Set((admins ?? []).map((r: { user_id: string }) => r.user_id));

  const targets: { id: string }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('AUTH_LIST_FAILED');
    for (const u of data.users) {
      if (!adminIds.has(u.id)) targets.push({ id: u.id });
    }
    if (data.users.length < 200) break;
    page += 1;
    if (page > 25) break;
  }
  return { keepAdmins: adminIds.size, targets };
}

export async function GET(request: Request) {
  const rl = await enforceRateLimit(`admin:purge:${requestIp(request)}`, 10, '10 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    await requireAdminUser(request);
  } catch (error) {
    return adminErrorResponse(error);
  }

  try {
    const { keepAdmins, targets } = await collectTargets();
    return NextResponse.json({
      dryRun: true,
      enabledInEnvironment:
        process.env.NODE_ENV !== 'production' || process.env.ALLOW_DESTRUCTIVE_ADMIN_PURGE === 'true',
      keepAdmins,
      wouldDelete: targets.length,
    });
  } catch {
    return NextResponse.json({ error: 'PURGE_DRY_RUN_FAILED' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rl = await enforceRateLimit(`admin:purge:exec:${requestIp(request)}`, 3, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let admin;
  try {
    admin = await requireAdminUser(request);
  } catch (error) {
    return adminErrorResponse(error);
  }

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_ADMIN_PURGE !== 'true') {
    return NextResponse.json(
      { error: 'PURGE_DISABLED_IN_PRODUCTION' },
      { status: 403 },
    );
  }

  const parsed = purgeBodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'CONFIRMATION_AND_REAUTH_REQUIRED' },
      { status: 400 },
    );
  }

  if (!verifyRevealToken(parsed.data.revealToken, admin.id)) {
    return NextResponse.json({ error: 'REAUTH_REQUIRED' }, { status: 403 });
  }

  try {
    const { keepAdmins, targets } = await collectTargets();

    await requireAuditEvent({
      action: 'ADMIN_MASS_USER_PURGE',
      resource: 'auth.users',
      userId: admin.id,
      outcome: 'allow',
      meta: { keepAdmins, targetCount: targets.length },
    });

    let deleted = 0;
    let failedCount = 0;
    for (const u of targets) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (error) failedCount += 1;
      else deleted += 1;
    }
    return NextResponse.json({ ok: failedCount === 0, keepAdmins, deleted, failedCount });
  } catch {
    return NextResponse.json({ error: 'PURGE_EXECUTION_FAILED' }, { status: 500 });
  }
}
