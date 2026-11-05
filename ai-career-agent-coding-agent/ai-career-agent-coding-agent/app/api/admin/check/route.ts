import { NextResponse, type NextRequest } from 'next/server';
import { getUser } from '@/lib/auth';
import { getAdminContext } from '@/lib/admin';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(`admin:check:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return NextResponse.json({ isAdmin: false, isOwner: false }, { status: 429 });

  try {
    const user = await getUser(req as unknown as Request).catch(() => null);
    if (!user) {
      return NextResponse.json({ isAdmin: false, isOwner: false });
    }
    const admin = await getAdminContext(user.id, user.email ?? null).catch(() => null);
    return NextResponse.json({
      isAdmin: Boolean(admin?.isActive),
      isOwner: Boolean(admin?.isOwner),
      role: admin?.role ?? null,
    });
  } catch {
    return NextResponse.json({ isAdmin: false, isOwner: false });
  }
}
