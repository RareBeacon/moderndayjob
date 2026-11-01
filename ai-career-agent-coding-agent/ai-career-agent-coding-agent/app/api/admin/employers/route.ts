import { NextResponse } from 'next/server';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { listAdminEmployers } from '@/lib/talent-pool/admin-service';

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`admin-emp-list:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  let admin;
  try {
    admin = await requireAdminUser(req);
  } catch (err) {
    return adminErrorResponse(err);
  }

  try {
    const out = await listAdminEmployers(admin.id);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: 'ADMIN_EMPLOYERS_LOAD_FAILED' }, { status: 500 });
  }
}
