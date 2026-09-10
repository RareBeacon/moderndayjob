import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getProfileCompleteness } from '@/lib/profile-completeness';

export async function GET() {
  const u = await requireUser().catch(() => null);
  if (!u) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  return NextResponse.json(await getProfileCompleteness(u.id));
}
