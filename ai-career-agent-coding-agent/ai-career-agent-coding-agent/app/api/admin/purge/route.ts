import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { revokeAllUserSessions } from '@/lib/session';

export const dynamic = 'force-dynamic';

const KEEP_EMAILS = new Set([
  'ogungboyeopeyemiphilip@gmail.com',
  'ogungboyeopeyemi@gmail.com',
]);

function isKeepEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return KEEP_EMAILS.has(email.toLowerCase().trim());
}

async function handlePurge(req: NextRequest, forceDry: boolean) {
  const rl = await enforceRateLimit(`admin:purge:${requestIp(req)}`, 10, '1 h', requestIp(req));
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let adminUser;
  try {
    adminUser = await requireAdminUser(req);
  } catch (error) {
    return adminErrorResponse(error);
  }
  if (!isKeepEmail(adminUser.email)) {
    return NextResponse.json({ error: 'FORBIDDEN', detail: 'Only the owner account can purge' }, { status: 403 });
  }

  const url = new URL(req.url);
  const dry = forceDry || url.searchParams.get('dry') === '1';

  if (!dry) {
    const body = (await req.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== 'PURGE_NON_ADMIN_USERS') {
      return NextResponse.json(
        { error: 'CONFIRMATION_REQUIRED', detail: 'Pass { "confirm": "PURGE_NON_ADMIN_USERS" } or ?dry=1' },
        { status: 400 },
      );
    }
  }

  // Always preserve every admin_users row and the calling admin.
  const { data: adminRows } = await supabaseAdmin.from('admin_users').select('user_id');
  const protectedIds = new Set<string>([
    adminUser.id,
    ...((adminRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  ]);

  let page = 1;
  const allUsers: Array<{ id: string; email?: string }> = [];
  try {
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await (
        supabaseAdmin.auth.admin as unknown as {
          listUsers: (opts?: { page?: number; perPage?: number }) => Promise<{
            data: { users: Array<{ id: string; email?: string }> };
            error: unknown;
          }>;
        }
      ).listUsers({ page, perPage: 100 });
      if (error) throw error;
      const users = data?.users ?? [];
      allUsers.push(...users);
      hasMore = users.length === 100;
      page += 1;
      if (allUsers.length > 5000) break;
    }
  } catch (e) {
    return NextResponse.json({ error: 'LIST_FAILED', detail: String(e) }, { status: 500 });
  }

  const total = allUsers.length;
  const shouldKeep = (u: { id: string; email?: string }) => protectedIds.has(u.id) || isKeepEmail(u.email);
  const toDelete = allUsers.filter((u) => !shouldKeep(u));
  const toKeep = allUsers.filter((u) => shouldKeep(u));

  if (dry) {
    return NextResponse.json({
      dry: true,
      total,
      keepCount: toKeep.length,
      toDeleteCount: toDelete.length,
    });
  }

  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const u of toDelete) {
    try {
      await revokeAllUserSessions(u.id).catch(() => {});
      const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (error) throw error;
      deleted.push(u.id);
    } catch (e) {
      failed.push({ id: u.id, error: String(e) });
    }
  }

  await supabaseAdmin.from('admin_actions').insert({
    admin_user_id: adminUser.id,
    target_user_id: adminUser.id,
    action: 'PURGE_NON_ADMIN_USERS',
  });

  return NextResponse.json({
    ok: true,
    total,
    kept: toKeep.length,
    deleted: deleted.length,
    failed: failed.length,
    failedDetails: failed,
  });
}

export async function POST(req: NextRequest) {
  return handlePurge(req, false);
}

export async function GET(req: NextRequest) {
  // GET is strictly read-only dry-run and never mutates users.
  return handlePurge(req, true);
}
