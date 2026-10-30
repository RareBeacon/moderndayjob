import { NextRequest, NextResponse } from 'next/server';
import { APP_SESSION_COOKIE, validateAppSession } from '@/lib/session';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * Admin-only session diagnostic endpoint.
 * Disabled in production for unauthenticated or non-admin callers, and never
 * returns raw token hashes, cookie values, or internal Supabase URLs.
 */
export async function GET(request: NextRequest) {
  const rl = await enforceRateLimit(`debug:${requestIp(request as unknown as Request)}`, 30, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let adminUser;
  try {
    adminUser = await requireAdminUser(request as unknown as Request);
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return adminErrorResponse(error);
  }

  const appToken = request.cookies.get(APP_SESSION_COOKIE)?.value ?? null;
  let sessionValid = false;
  let sessionReason = 'NO_APP_COOKIE';
  if (appToken) {
    try {
      const v = await validateAppSession({ token: appToken, userId: adminUser.id });
      sessionValid = v.valid;
      sessionReason = v.valid ? 'VALID' : v.reason;
    } catch {
      sessionValid = false;
      sessionReason = 'EXCEPTION';
    }
  }

  return NextResponse.json(
    {
      time: new Date().toISOString(),
      authenticated: true,
      userId: adminUser.id,
      appCookiePresent: Boolean(appToken),
      sessionValid,
      sessionReason,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
