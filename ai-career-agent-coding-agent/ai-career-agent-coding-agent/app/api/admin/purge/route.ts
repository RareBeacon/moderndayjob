import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const KEEP_EMAILS = new Set([
  'ogungboyeopeyemiphilip@gmail.com',
  'ogungboyeopeyemi@gmail.com',
  // censored variant from user message - keep any ogungboyeopeyemi prefix
]);

function isKeepEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (KEEP_EMAILS.has(lower)) return true;
  // allow any ogungboyeopeyemi* @gmail.com to be kept (fresh start keeps owner)
  if (lower.startsWith('ogungboyeopeyemi') && lower.endsWith('@gmail.com')) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const rl = await enforceRateLimit(`admin:purge:${requestIp(req)}`, 10, '1 h', requestIp(req));
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  let user;
  try {
    user = await requireUser({ req });
  } catch {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (!isKeepEmail(user.email)) {
    return NextResponse.json({ error: 'FORBIDDEN', detail: 'Only the owner account can purge' }, { status: 403 });
  }

  // Dry run: ?dry=1 to list without deleting
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';

  // List users via admin API (paginated)
  let page = 1;
  const allUsers: Array<{ id: string; email?: string }> = [];
  let total = 0;
  // Supabase admin listUsers supports page/perPage
  // Use direct fetch to avoid pagination limits in JS client wrapper
  try {
    // Use supabaseAdmin.auth.admin.listUsers if available
    // The JS client exposes listUsers with pagination
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await (supabaseAdmin.auth.admin as unknown as { listUsers: (opts?: { page?: number; perPage?: number }) => Promise<{ data: { users: Array<{ id: string; email?: string }> }; error: unknown }> }).listUsers({ page, perPage: 100 });
      if (error) throw error;
      const users = data?.users ?? [];
      allUsers.push(...users);
      hasMore = users.length === 100;
      page += 1;
      // safety cap
      if (allUsers.length > 5000) break;
    }
  } catch (e) {
    return NextResponse.json({ error: 'LIST_FAILED', detail: String(e) }, { status: 500 });
  }
  total = allUsers.length;
  const toDelete = allUsers.filter((u) => !isKeepEmail(u.email));
  const toKeep = allUsers.filter((u) => isKeepEmail(u.email));

  if (dry) {
    return NextResponse.json({
      dry: true,
      total,
      keep: toKeep.map((u) => ({ id: u.id, email: u.email })),
      toDelete: toDelete.map((u) => ({ id: u.id, email: u.email })),
      toDeleteCount: toDelete.length,
    });
  }

  // Real deletion
  const deleted: string[] = [];
  const failed: Array<{ id: string; email?: string; error: string }> = [];
  for (const u of toDelete) {
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (error) throw error;
      deleted.push(u.id);
    } catch (e) {
      failed.push({ id: u.id, email: u.email, error: String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    total,
    kept: toKeep.length,
    deleted: deleted.length,
    failed: failed.length,
    keptDetails: toKeep.map((u) => u.email),
    failedDetails: failed,
  });
}

export async function GET(req: NextRequest) {
  // GET with dry=1 for easy browser check
  return POST(req);
}
